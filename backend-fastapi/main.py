"""API de acceso cerrado y reservas compartidas en Supabase."""
import os
import re
import httpx
from pathlib import Path
from datetime import date, time
from typing import Literal
from uuid import UUID

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from postgrest.exceptions import APIError
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions

import actividad
import arriendos

load_dotenv(Path(__file__).with_name(".env"))
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173","http://localhost:5174","http://127.0.0.1:5173","http://127.0.0.1:5174","http://localhost:8000","http://127.0.0.1:8000"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
bearer = HTTPBearer(auto_error=False)


def client(admin=False):
    key = os.getenv("SUPABASE_SECRET_KEY") if admin else os.getenv("SUPABASE_PUBLISHABLE_KEY")
    if not os.getenv("SUPABASE_URL"):
        raise HTTPException(503, "Falta configurar SUPABASE_URL en backend-fastapi/.env.")
    if not key:
        variable = "SUPABASE_SECRET_KEY" if admin else "SUPABASE_PUBLISHABLE_KEY"
        raise HTTPException(503, f"Falta configurar {variable} en backend-fastapi/.env. Contacta al administrador.")
    # Un cliente por operación: nunca compartir sesiones de distintos usuarios.
    return create_client(os.environ["SUPABASE_URL"], key, options=SyncClientOptions(auto_refresh_token=False, persist_session=False, postgrest_client_timeout=8))


def profile(user_id):
    try:
        db = client(admin=True)
        rows = db.table("usuarios").select("id,nombre,rol,activo").eq("id", str(user_id)).execute().data
        if not rows:
            raise HTTPException(403, "La cuenta existe en Auth, pero no tiene un perfil en usuarios. Contacta al administrador.")
        if not rows[0]["activo"]:
            raise HTTPException(403, "Tu cuenta no tiene acceso activo al estudio.")
        row = rows[0]
        roles = db.table("rol").select("nombre").eq("id", row["rol"]).execute().data
        role = roles[0]["nombre"].strip().lower() if roles else ""
        if role not in ("admin", "tatuador"):
            raise HTTPException(403, "El usuario no tiene un rol autorizado.")
        return {"id": row["id"], "name": row["nombre"], "role": role}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "No se pudo consultar el perfil. Revisa la configuración y migración.") from exc


def token(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Inicia sesión para continuar.", headers={"WWW-Authenticate": "Bearer"})
    return credentials.credentials


def get_current_user(jwt: str = Depends(token)):
    try:
        result = client().auth.get_user(jwt)
        if not result or not result.user:
            raise ValueError()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(401, "La sesión expiró o no es válida.") from exc
    return profile(result.user.id)


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Esta operación requiere un administrador.")
    return user


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)

# Registro manual (sin correo de invitación, mientras no haya un servidor SMTP).
class CreateUser(BaseModel):
    
    nombre: str = Field(min_length=1, max_length=120)
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=254)
    password: str = Field(min_length=12, max_length=128)
    rol: int = Field(gt=0)
    modalidad: int | None = Field(default=None, gt=0)



class SessionRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class PasswordRequest(BaseModel):
    password: str = Field(min_length=12, max_length=128)


class InviteRequest(BaseModel):
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=254)
    nombre: str = Field(min_length=1, max_length=120)
    modalidad: int | None = None


class ActiveRequest(BaseModel):
    activo: bool


HOUR_PATTERN = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"


class ReservationSession(BaseModel):
    id: UUID
    puestoId: int = Field(gt=0)
    fecha: date
    horaInicio: str = Field(pattern=HOUR_PATTERN)
    horaFin: str = Field(pattern=HOUR_PATTERN)
    estado: Literal['Programada', 'Cancelada', 'Completada']


class ReservationRequest(BaseModel):
    # El cliente se guarda dentro de la reserva: no hay una ficha de clientes aparte.
    clienteNombre: str = Field(max_length=120)
    # RUT completo con dígito verificador (ej. 11222333-K). Se toleran puntos y espacios por compatibilidad.
    clienteRut: str = Field(max_length=16)
    tatuadorId: UUID
    precio: int = Field(ge=0, le=9007199254740991)
    sesiones: list[ReservationSession] = Field(min_length=1, max_length=30)


class ReservationCreate(ReservationRequest):
    id: UUID


class SessionStatusRequest(BaseModel):
    estado: Literal['Programada', 'Cancelada', 'Completada']


def session_response(result):
    if not result.user or not result.session:
        raise HTTPException(401, "No se pudo iniciar la sesión.")
    return {"user": profile(result.user.id), "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login")
def login(data: LoginRequest):
    # El acceso requiere Auth y el perfil real; detectar configuración incompleta
    # antes de contactar Auth, sin recurrir a credenciales de demostración.
    client(admin=True)
    try:
        result = client().auth.sign_in_with_password({"email": data.email.strip(), "password": data.password})
    except HTTPException:
        raise
    except httpx.RequestError as exc:
        raise HTTPException(503, "No se pudo conectar con Supabase. Intenta nuevamente.") from exc
    except Exception as exc:
        raise HTTPException(401, "Correo o contraseña incorrectos.") from exc
    return session_response(result)


@app.post("/auth/refresh")
def refresh(data: SessionRequest):
    try:
        result = client().auth.refresh_session(data.refresh_token)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(401, "Vuelve a iniciar sesión.") from exc
    return session_response(result)


@app.get("/auth/me")
def me(user=Depends(get_current_user)):
    return user


@app.post("/auth/logout")
def logout(jwt: str = Depends(token)):
    try:
        client(admin=True).auth.admin.sign_out(jwt, "local")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, "No se pudo cerrar la sesión remota.") from exc
    return {"ok": True}


@app.post("/auth/password")
def password(data: PasswordRequest, jwt: str = Depends(token), user=Depends(get_current_user)):
    # Actualización con el JWT del propio usuario, no con privilegios administrativos.
    try:
        response = httpx.put(os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/user",
            headers={"apikey": os.environ["SUPABASE_PUBLISHABLE_KEY"], "Authorization": "Bearer " + jwt},
            json={"password": data.password}, timeout=20)
        if response.status_code >= 400:
            raise HTTPException(400, "No se pudo establecer la contraseña. Revisa su complejidad o solicita una nueva invitación.")
    except httpx.RequestError as exc:
        raise HTTPException(502, "No se pudo contactar con el servicio de autenticación.") from exc
    return {"ok": True}


@app.get("/api/usuarios/")
def users(admin=Depends(require_admin)):
    try:
        db = client(admin=True)
        rows = db.table("usuarios").select("id,nombre,rol,modalidad,activo,creado_en").order("nombre").execute().data
        roles = {r["id"]: r["nombre"].strip().lower() for r in db.table("rol").select("id,nombre").execute().data}
        return [{**r, "role": roles.get(r["rol"], "")} for r in rows]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "No se pudieron cargar los usuarios.") from exc


@app.get("/api/modalidad/")
def modalities(user=Depends(require_admin)):
    try:
        return client(admin=True).table("modalidad").select("id,nombre").execute().data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "No se pudieron consultar las modalidades.") from exc

@app.get("/api/rol/")
def roles(user=Depends(require_admin)):
    try:
        return client(admin=True).table("rol").select("id,nombre").execute().data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "No se pudieron consultar los roles.") from exc


def natural_key(name):
    """Ordena "Puesto 2" antes que "Puesto 10"."""
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", name)]


def modality_names(db):
    """{id: nombre} de la tabla modalidad."""
    return {row['id']: row['nombre'].strip() for row in db.table('modalidad').select('id,nombre').execute().data}


# Un puesto Full solo tiene titulares con modalidad Full, y uno Compartido, titulares Compartido.
# Rotativo, Rotativo light y Guest no son titulares: agendan en puestos rotativos.
def titular_modality_error(nombre, modalidad, tipo):
    if (modalidad or '').casefold() != tipo.casefold():
        actual = f'tiene modalidad {modalidad}' if modalidad else 'no tiene modalidad asignada'
        return f'Para ser titular de un puesto {tipo}, {nombre} debe tener modalidad {tipo}, pero {actual}. Cámbiala en Tatuadores.'
    return ''


def puesto_db_error(exc, fallback):
    """Traduce los errores de las reglas de puestos (migración 009) a respuestas claras."""
    if isinstance(exc, APIError):
        if exc.code == "P0001":
            return HTTPException(409, exc.message)
        if exc.code == "22023":
            return HTTPException(422, exc.message)
        if exc.code == "P0002":
            return HTTPException(404, exc.message)
        if exc.code == "23505":
            return HTTPException(409, "Ese tatuador ya es titular de otro puesto.")
    return HTTPException(503, fallback)


def log_event(user, categoria, accion, resumen, entidad_id=None, detalle=None):
    """Registro de actividad (migración 014). Nunca interrumpe la operación que ya se hizo."""
    try:
        db = client(admin=True)
    except HTTPException:
        return
    actividad.registrar(db, user, categoria, accion, resumen, entidad_id, detalle)


def user_name(db, user_id):
    try:
        rows = db.table("usuarios").select("nombre").eq("id", str(user_id)).execute().data
        return rows[0]["nombre"] if rows else "un usuario"
    except Exception:  # noqa: BLE001
        return "un usuario"


@app.get("/api/puestos")
def puestos(user=Depends(get_current_user)):
    try:
        db = client(admin=True)
        states = {row["id"]: row["estado"].strip() for row in db.table("puesto_estados").select("id,estado").execute().data}
        rows = db.table("puesto").select("id,nombre,estado_id,tipo").execute().data
        holders = db.table("puesto_titulares").select("puesto,tatuador").execute().data
        ids = sorted({row["tatuador"] for row in holders})
        names = {row["id"]: row["nombre"] for row in db.table("usuarios").select("id,nombre").in_("id", ids).execute().data} if ids else {}
        result = []
        for row in sorted(rows, key=lambda item: natural_key(item["nombre"])):
            state = states.get(row["estado_id"], "Sin estado")
            titulares = sorted(({"id": h["tatuador"], "nombre": names.get(h["tatuador"], "Tatuador")}
                                for h in holders if h["puesto"] == row["id"]), key=lambda t: t["nombre"].casefold())
            result.append({"id": str(row["id"]), "nombre": row["nombre"], "estado": state,
                           "estadoId": row["estado_id"], "disponible": state.casefold() == "habilitado",
                           "tipo": row.get("tipo") or "Rotativo", "titulares": titulares})
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "No se pudieron cargar los puestos. Comprueba las migraciones 007, 009 y 010 en Supabase.") from exc


@app.get("/api/puestos/estados")
def puesto_states(admin=Depends(require_admin)):
    try:
        return client(admin=True).table("puesto_estados").select("id,estado").order("id").execute().data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "No se pudieron cargar los estados de los puestos.") from exc


class PuestoUpdateRequest(BaseModel):
    estadoId: int | None = Field(default=None, gt=0)
    tipo: Literal["Full", "Compartido", "Rotativo"] | None = None


# Las sesiones ya agendadas se conservan: un puesto en mantenimiento solo rechaza sesiones nuevas o movidas.
# Cambiar el tipo falla (409) si el puesto queda con más titulares de los que permite el nuevo tipo.
@app.patch("/api/puestos/{puesto_id}")
def update_puesto(puesto_id: int, data: PuestoUpdateRequest, admin=Depends(require_admin)):
    changes = {}
    if data.estadoId is not None:
        changes["estado_id"] = data.estadoId
    if data.tipo is not None:
        changes["tipo"] = data.tipo
    if not changes:
        raise HTTPException(422, "Indica qué cambiar del puesto.")
    try:
        db = client(admin=True)
        previous = db.table("puesto").select("nombre,tipo,estado_id").eq("id", puesto_id).execute().data
        if data.estadoId is not None and not db.table("puesto_estados").select("id").eq("id", data.estadoId).execute().data:
            raise HTTPException(422, "Selecciona un estado válido.")
        if data.tipo is not None:
            holders = db.table("puesto_titulares").select("tatuador").eq("puesto", puesto_id).execute().data
            if holders:
                names = modality_names(db)
                rows = db.table("usuarios").select("nombre,modalidad").in_("id", [h["tatuador"] for h in holders]).execute().data
                distintos = [r["nombre"] for r in rows if (names.get(r["modalidad"]) or "").casefold() != data.tipo.casefold()]
                if distintos:
                    raise HTTPException(409, f"No se puede cambiar a {data.tipo}: {', '.join(distintos)} no tiene modalidad {data.tipo}. "
                                             "Quita los titulares, cambia el tipo y vuelve a asignarlos.")
        updated = db.table("puesto").update(changes).eq("id", puesto_id).execute().data
        if not updated:
            raise HTTPException(404, "El puesto no existe.")
        antes = previous[0] if previous else {}
        nombre = antes.get("nombre") or f"Puesto {puesto_id}"
        if data.estadoId is not None and data.estadoId != antes.get("estado_id"):
            states = {r["id"]: r["estado"].strip() for r in db.table("puesto_estados").select("id,estado").execute().data}
            log_event(admin, "puesto", "estado", f"Cambió {nombre} a {states.get(data.estadoId, 'otro estado')} "
                      f"(antes {states.get(antes.get('estado_id'), 'sin estado')}).", puesto_id,
                      {"antes": states.get(antes.get("estado_id")), "despues": states.get(data.estadoId)})
        if data.tipo is not None and data.tipo != antes.get("tipo"):
            log_event(admin, "puesto", "tipo", f"Cambió el tipo de {nombre} a {data.tipo} (antes {antes.get('tipo')}).", puesto_id,
                      {"antes": antes.get("tipo"), "despues": data.tipo})
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise puesto_db_error(exc, "No se pudo actualizar el puesto.") from exc


class TitularRequest(BaseModel):
    tatuadorId: UUID


@app.post("/api/puestos/{puesto_id}/titulares", status_code=201)
def add_titular(puesto_id: int, data: TitularRequest, admin=Depends(require_admin)):
    tatuador = str(data.tatuadorId)
    try:
        db = client(admin=True)
        rows = db.table("puesto").select("id,nombre,tipo").eq("id", puesto_id).execute().data
        if not rows:
            raise HTTPException(404, "El puesto no existe.")
        puesto = rows[0]
        users = db.table("usuarios").select("id,nombre,rol,activo,modalidad").eq("id", tatuador).execute().data
        roles = db.table("rol").select("nombre").eq("id", users[0]["rol"]).execute().data if users else []
        if not users or not roles or roles[0]["nombre"].strip().lower() != "tatuador":
            raise HTTPException(422, "Selecciona un tatuador válido.")
        if not users[0]["activo"]:
            raise HTTPException(422, f"{users[0]['nombre']} está desactivado.")
        current = db.table("puesto_titulares").select("puesto").eq("tatuador", tatuador).execute().data
        if current:
            if current[0]["puesto"] == puesto_id:
                raise HTTPException(409, f"{users[0]['nombre']} ya es titular de {puesto['nombre']}.")
            other = db.table("puesto").select("nombre").eq("id", current[0]["puesto"]).execute().data
            raise HTTPException(409, f"{users[0]['nombre']} ya es titular de {other[0]['nombre'] if other else 'otro puesto'}. Quítalo de ahí primero.")
        error = titular_modality_error(users[0]["nombre"], modality_names(db).get(users[0]["modalidad"]), puesto["tipo"])
        if error:
            raise HTTPException(422, error)
        # El cupo según el tipo lo valida el trigger de la migración 009 (sin carreras entre dos admins).
        db.table("puesto_titulares").insert({"puesto": puesto_id, "tatuador": tatuador}).execute()
        log_event(admin, "puesto", "titular_agregado",
                  f"Asignó a {users[0]['nombre']} como titular de {puesto['nombre']} ({puesto['tipo']}).", puesto_id)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise puesto_db_error(exc, "No se pudo asignar el titular.") from exc


@app.delete("/api/puestos/{puesto_id}/titulares/{tatuador_id}")
def remove_titular(puesto_id: int, tatuador_id: UUID, admin=Depends(require_admin)):
    try:
        db = client(admin=True)
        deleted = db.table("puesto_titulares").delete().eq("puesto", puesto_id).eq("tatuador", str(tatuador_id)).execute().data
        if not deleted:
            raise HTTPException(404, "Ese tatuador no es titular de este puesto.")
        puesto = db.table("puesto").select("nombre").eq("id", puesto_id).execute().data
        log_event(admin, "puesto", "titular_quitado",
                  f"Quitó a {user_name(db, tatuador_id)} como titular de {puesto[0]['nombre'] if puesto else f'Puesto {puesto_id}'}.", puesto_id)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise puesto_db_error(exc, "No se pudo quitar el titular.") from exc


@app.post("/api/usuarios/invitaciones", status_code=201)
def invite(data: InviteRequest, admin=Depends(require_admin)):
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(422, "El nombre es obligatorio.")
    redirect = os.getenv("INVITE_REDIRECT_URL")
    if not redirect:
        raise HTTPException(503, "Configura INVITE_REDIRECT_URL antes de invitar.")
    db = client(admin=True)
    if data.modalidad is not None:
        if not db.table("modalidad").select("id").eq("id", data.modalidad).execute().data:
            raise HTTPException(422, "Selecciona una modalidad válida.")
    try:
        # El trigger SQL crea el perfil dentro de la transacción de Auth, antes del correo.
        db.auth.admin.invite_user_by_email(data.email.strip().lower(), {
            "redirect_to": redirect, "data": {"nombre": nombre, "modalidad": data.modalidad}})
    except Exception as exc:
        raise HTTPException(400, "No se pudo enviar la invitación. Revisa si el correo ya existe, el servicio de correo y la migración.") from exc
    log_event(admin, "tatuador", "invitacion", f"Invitó a {nombre} ({data.email.strip().lower()}) como tatuador.")
    return {"message": "Invitación enviada."}


@app.patch("/api/usuarios/{user_id}/actividad")
def activity(user_id: UUID, data: ActiveRequest, admin=Depends(require_admin)):
    db = client(admin=True)
    rows = db.table("usuarios").select("id,nombre,rol,activo").eq("id", str(user_id)).execute().data
    if not rows:
        raise HTTPException(404, "Usuario no encontrado.")
    roles = db.table("rol").select("nombre").eq("id", rows[0]["rol"]).execute().data
    if not roles or roles[0]["nombre"].strip().lower() != "tatuador":
        raise HTTPException(403, "Este módulo solo modifica el acceso de tatuadores.")
    db.table("usuarios").update({"activo": data.activo}).eq("id", str(user_id)).execute()
    if rows[0].get("activo") != data.activo:
        log_event(admin, "tatuador", "activado" if data.activo else "desactivado",
                  f"{'Activó' if data.activo else 'Desactivó'} el acceso de {rows[0]['nombre']}.", user_id)
    return {"ok": True}


class ModalityRequest(BaseModel):
    modalidad: int | None = Field(default=None, gt=0)


# Cambia la modalidad (y con ella el arriendo) desde el mes actual. Un titular conserva la de su puesto.
@app.patch("/api/usuarios/{user_id}/modalidad")
def change_modality(user_id: UUID, data: ModalityRequest, admin=Depends(require_admin)):
    try:
        db = client(admin=True)
        rows = db.table("usuarios").select("id,nombre,rol,modalidad").eq("id", str(user_id)).execute().data
        if not rows:
            raise HTTPException(404, "Usuario no encontrado.")
        roles = db.table("rol").select("nombre").eq("id", rows[0]["rol"]).execute().data
        if not roles or roles[0]["nombre"].strip().lower() != "tatuador":
            raise HTTPException(403, "Solo los tatuadores tienen modalidad.")
        names = modality_names(db)
        if data.modalidad is not None and data.modalidad not in names:
            raise HTTPException(422, "Selecciona una modalidad válida.")
        holder = db.table("puesto_titulares").select("puesto").eq("tatuador", str(user_id)).execute().data
        if holder:
            puesto = db.table("puesto").select("nombre,tipo").eq("id", holder[0]["puesto"]).execute().data[0]
            if (names.get(data.modalidad) or "").casefold() != puesto["tipo"].casefold():
                raise HTTPException(409, f"{rows[0]['nombre']} es titular de {puesto['nombre']} ({puesto['tipo']}). "
                                         "Quítalo como titular en Espacios antes de cambiar su modalidad.")
        db.table("usuarios").update({"modalidad": data.modalidad}).eq("id", str(user_id)).execute()
        if rows[0].get("modalidad") != data.modalidad:
            antes = names.get(rows[0].get("modalidad")) or "sin modalidad"
            despues = names.get(data.modalidad) or "sin modalidad"
            log_event(admin, "tatuador", "modalidad", f"Cambió la modalidad de {rows[0]['nombre']}: {antes} → {despues}.", user_id,
                      {"antes": antes, "despues": despues})
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "No se pudo cambiar la modalidad. Comprueba la migración 013.") from exc


def reservation_rpc(name, params):
    try:
        return client(admin=True).rpc(name, params).execute().data
    except HTTPException:
        raise
    except APIError as exc:
        status = {'42501': 403, '22023': 422, 'P0002': 404, 'P0001': 409, '23505': 409}.get(exc.code)
        if status and exc.code != '42501':
            raise HTTPException(status, exc.message) from exc
        if status == 403:
            raise HTTPException(403, 'No tienes permiso para realizar esta operación.') from exc
        raise HTTPException(503, 'No se pudo acceder a las reservas. Comprueba la migración de reservas en Supabase.') from exc
    except Exception as exc:
        raise HTTPException(503, 'No se pudo comunicar con la base de datos de reservas.') from exc


@app.get('/api/reservas')
def list_reservations(user=Depends(get_current_user)):
    return reservation_rpc('okami_listar_reservas', {'p_actor': user['id']})


@app.get('/api/reservas/catalogos')
def reservation_catalogs(user=Depends(get_current_user)):
    try:
        db = client(admin=True)
        if user['role'] == 'tatuador':
            artists = [{'id': user['id'], 'nombre': user['name']}]
        else:
            role_ids = [row['id'] for row in db.table('rol').select('id,nombre').execute().data
                        if row['nombre'].strip().lower() == 'tatuador']
            artists = db.table('usuarios').select('id,nombre,modalidad').in_('rol', role_ids).eq('activo', True).order('nombre').execute().data if role_ids else []
            names = modality_names(db)
            artists = [{'id': a['id'], 'nombre': a['nombre'], 'modalidad': names.get(a['modalidad'])} for a in artists]
        return {'tatuadores': artists}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, 'No se pudieron cargar los tatuadores.') from exc


def normalize_rut(value):
    """Forma canónica del RUT: solo dígitos y K mayúscula, sin puntos ni guion (ej. 12345678K)."""
    return re.sub(r'[^0-9K]', '', (value or '').upper())


def rut_error(rut):
    if not rut:
        return 'Ingresa el RUT del cliente con su dígito verificador.'
    if not re.fullmatch(r'\d{1,9}[0-9K]', rut) or set(rut[:-1]) == {'0'}:
        return 'Ingresa un RUT válido, sin puntos y con guion. Ej: 12345678-5.'
    total = sum(int(digit) * (2 + index % 6) for index, digit in enumerate(reversed(rut[:-1])))
    expected = {11: '0', 10: 'K'}.get(11 - total % 11, str(11 - total % 11))
    if rut[-1] != expected:
        return 'El dígito verificador no corresponde al RUT ingresado.'
    return ''


def clean_name(value):
    """Nombre con los espacios normalizados: "  ana   pérez " → "ana pérez"."""
    return ' '.join((value or '').split())


def client_name_error(name):
    """El nombre del cliente es solo texto: letras (con tildes y ñ), espacios, guiones, apóstrofos o puntos."""
    if not name:
        return 'Ingresa el nombre del cliente.'
    if any(char.isdigit() for char in name):
        return 'El nombre del cliente solo puede tener letras. Si escribiste el RUT, ingrésalo en el campo RUT.'
    if not re.fullmatch(r"[^\W\d_]+(?:[ '’.\-]+[^\W\d_]+)*\.?", name):
        return 'El nombre del cliente solo puede tener letras, espacios, guiones o apóstrofos.'
    if sum(char.isalpha() for char in name) < 2:
        return 'Ingresa el nombre completo del cliente.'
    return ''


def sessions_error(sessions):
    if len({session.id for session in sessions}) != len(sessions):
        return 'Cada sesión necesita un identificador distinto.'
    for session in sessions:
        if time.fromisoformat(session.horaFin) <= time.fromisoformat(session.horaInicio):
            return 'La hora de término de cada sesión debe ser posterior a la de inicio.'
    active = [s for s in sessions if s.estado != 'Cancelada']
    for index, first in enumerate(active):
        for second in active[index + 1:]:
            if first.fecha == second.fecha and first.horaInicio < second.horaFin and second.horaInicio < first.horaFin:
                return 'Las sesiones de esta reserva no pueden cruzarse entre sí.'
    return ''


def reservation_snapshot(user, reservation_id):
    """La reserva tal como la ve `user` (formato de okami_listar_reservas), o None. Para el registro de actividad."""
    try:
        rows = reservation_rpc('okami_listar_reservas', {'p_actor': user['id']})
    except HTTPException:
        return None
    if not isinstance(rows, list):
        return None
    return next((row for row in rows if isinstance(row, dict) and str(row.get('id')) == str(reservation_id)), None)


def log_reservation(operation, reservation_id, user, antes):
    try:
        despues = reservation_snapshot(user, reservation_id) if operation in ('crear', 'editar', 'restaurar') else None
        reserva = despues or antes or {}
        if operation == 'crear':
            resumen, detalle = actividad.describe_created(reserva)
        elif operation == 'editar':
            resumen, detalle = actividad.describe_edited(antes or {}, reserva)
        elif operation == 'borrar':
            resumen, detalle = actividad.describe_deleted(reserva)
        else:
            resumen, detalle = actividad.describe_restored(reserva)
    except Exception:  # noqa: BLE001 - el registro nunca interrumpe la operación
        resumen, detalle = f'{operation.capitalize()} una reserva.', {}
    log_event(user, 'reserva', operation, resumen, reservation_id, detalle)


def write_reservation(operation, reservation_id, data, user):
    params = {'p_actor': user['id'], 'p_operacion': operation, 'p_id': str(reservation_id)}
    antes = reservation_snapshot(user, reservation_id) if operation != 'crear' else None
    if data is not None:
        error = sessions_error(data.sesiones)
        if error:
            raise HTTPException(422, error)
        nombre = clean_name(data.clienteNombre)
        error = client_name_error(nombre)
        if error:
            raise HTTPException(422, error)
        rut = normalize_rut(data.clienteRut)
        error = rut_error(rut)
        if error:
            raise HTTPException(422, error)
        params.update(p_cliente_nombre=nombre,
                      p_cliente_rut=rut,
                      p_tatuador=str(data.tatuadorId), p_precio=data.precio,
                      p_sesiones=[{'id': str(s.id), 'puesto': s.puestoId, 'estado': s.estado,
                                   'inicio': f'{s.fecha}T{s.horaInicio}', 'fin': f'{s.fecha}T{s.horaFin}'}
                                  for s in data.sesiones])
    result = {'id': reservation_rpc('okami_guardar_reserva', params)}
    log_reservation(operation, reservation_id, user, antes)
    return result


@app.post('/api/reservas', status_code=201)
def create_reservation(data: ReservationCreate, user=Depends(get_current_user)):
    return write_reservation('crear', data.id, data, user)


@app.patch('/api/reservas/{reservation_id}')
def edit_reservation(reservation_id: UUID, data: ReservationRequest, user=Depends(get_current_user)):
    return write_reservation('editar', reservation_id, data, user)


# Borrar no elimina: la reserva pasa al historial y se puede restaurar.
@app.delete('/api/reservas/{reservation_id}')
def delete_reservation(reservation_id: UUID, user=Depends(get_current_user)):
    return write_reservation('borrar', reservation_id, None, user)

@app.post('/api/reservas/{reservation_id}/restaurar')
def restore_reservation(reservation_id: UUID, user=Depends(get_current_user)):
    return write_reservation('restaurar', reservation_id, None, user)


# Cambia el estado de una sola sesión, sin reenviar el resto de la reserva.
@app.patch('/api/reservas/{reservation_id}/sesiones/{session_id}')
def change_session_status(reservation_id: UUID, session_id: UUID, data: SessionStatusRequest, user=Depends(get_current_user)):
    antes = reservation_snapshot(user, reservation_id)
    reservation_rpc('okami_estado_sesion', {'p_actor': user['id'], 'p_reserva': str(reservation_id),
                                            'p_sesion': str(session_id), 'p_estado': data.estado})
    sesion = next((s for s in (antes or {}).get('sesiones') or [] if str(s['id']) == str(session_id)), None)
    if sesion and sesion.get('estado') != data.estado:
        resumen, detalle = actividad.describe_status(antes, sesion, sesion.get('estado'), data.estado)
        log_event(user, 'sesion', data.estado.lower(), resumen, reservation_id, detalle)
    elif not sesion:
        log_event(user, 'sesion', data.estado.lower(), f'Marcó una sesión como {data.estado}.', reservation_id)
    return {'id': str(session_id), 'estado': data.estado}



# ---------- Arriendos (solo admin) ----------
PERIOD_PATTERN = r'^\d{4}-(0[1-9]|1[0-2])$'


def rent_data(db, desde, hasta, tatuador=None):
    """Datos para calcular el arriendo: tatuadores, modalidades, tarifas, historial y pagos entre dos meses.
    Con `tatuador`, solo los de esa persona."""
    roles = {r['id']: r['nombre'].strip().lower() for r in db.table('rol').select('id,nombre').execute().data}
    users = db.table('usuarios').select('id,nombre,rol,activo,creado_en').execute().data
    tatuadores = [u for u in users if roles.get(u['rol']) == 'tatuador' and (tatuador is None or str(u['id']) == tatuador)]
    tarifas = db.table('modalidad_tarifas').select('modalidad,vigente_desde,cobro,monto,minimo_mensual,monto_reducido,dias_reducido').execute().data
    query = db.table('modalidad_historial').select('tatuador,desde,modalidad')
    historial = (query.eq('tatuador', tatuador) if tatuador else query).execute().data
    query = (db.table('pagos_arriendo').select('id,tatuador,periodo,monto,pagado_en,nota')
             .gte('periodo', arriendos.month_start(desde)).lte('periodo', arriendos.month_start(hasta)))
    pagos = (query.eq('tatuador', tatuador) if tatuador else query).execute().data
    return tatuadores, modality_names(db), tarifas, historial, pagos


def tariffs_in_force(modalidades, tarifas, inicio):
    vigentes = []
    for modalidad_id, nombre in sorted(modalidades.items()):
        tarifa = arriendos.vigente([t for t in tarifas if t['modalidad'] == modalidad_id], 'vigente_desde', inicio)
        if tarifa:
            vigentes.append({'modalidad': nombre, 'cobro': tarifa['cobro'], 'monto': tarifa['monto'],
                             'minimo': tarifa['minimo_mensual'], 'montoReducido': tarifa['monto_reducido'],
                             'diasReducido': tarifa['dias_reducido']})
    return vigentes


RENT_DB_ERROR = 'No se pudieron cargar los arriendos. Comprueba la migración 013 en Supabase.'


@app.get('/api/arriendos')
def rent_month(mes: str = Query(pattern=PERIOD_PATTERN), admin=Depends(require_admin)):
    try:
        tatuadores, modalidades, tarifas, historial, pagos = rent_data(client(admin=True), mes, mes)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, RENT_DB_ERROR) from exc
    reservas = reservation_rpc('okami_listar_reservas', {'p_actor': admin['id']})
    result = arriendos.resumen_mes(mes, tatuadores, modalidades, tarifas, historial, reservas, pagos)
    result['tarifas'] = tariffs_in_force(modalidades, tarifas, arriendos.month_start(mes))
    return result


# Totales de los últimos meses (para el gráfico del Dashboard): estimado, cobrado y pendiente de cada mes.
@app.get('/api/arriendos/historial')
def rent_history(hasta: str = Query(pattern=PERIOD_PATTERN), meses: int = Query(default=6, ge=1, le=24), admin=Depends(require_admin)):
    desde = arriendos.shift_month(hasta, -(meses - 1))
    try:
        tatuadores, modalidades, tarifas, historial, pagos = rent_data(client(admin=True), desde, hasta)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, RENT_DB_ERROR) from exc
    reservas = reservation_rpc('okami_listar_reservas', {'p_actor': admin['id']})
    return arriendos.historial_meses(hasta, meses, tatuadores, modalidades, tarifas, historial, reservas, pagos)


# El arriendo del propio tatuador: solo el suyo, de solo lectura (los pagos los registra el admin).
@app.get('/api/arriendos/mio')
def my_rent(mes: str = Query(pattern=PERIOD_PATTERN), user=Depends(get_current_user)):
    if user['role'] != 'tatuador':
        raise HTTPException(403, 'Solo los tatuadores tienen arriendo propio.')
    try:
        tatuadores, modalidades, tarifas, historial, pagos = rent_data(client(admin=True), mes, mes, tatuador=str(user['id']))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, RENT_DB_ERROR) from exc
    reservas = reservation_rpc('okami_listar_reservas', {'p_actor': user['id']})
    filas = arriendos.resumen_mes(mes, tatuadores, modalidades, tarifas, historial, reservas, pagos)['filas']
    fila = filas[0] if filas else None
    if fila:
        # El tatuador ve sus pagos (monto y fecha), pero no las notas internas del estudio.
        fila['pagos'] = [{'monto': p['monto'], 'pagadoEn': p['pagadoEn']} for p in fila['pagos']]
    return {'periodo': mes, 'arriendo': fila}


class RentPaymentRequest(BaseModel):
    tatuadorId: UUID
    periodo: str = Field(pattern=PERIOD_PATTERN)
    monto: int = Field(gt=0, le=100_000_000)
    pagadoEn: date
    nota: str | None = Field(default=None, max_length=200)


@app.post('/api/arriendos/pagos', status_code=201)
def add_rent_payment(data: RentPaymentRequest, admin=Depends(require_admin)):
    try:
        db = client(admin=True)
        users = db.table('usuarios').select('id,nombre,rol').eq('id', str(data.tatuadorId)).execute().data
        roles = db.table('rol').select('nombre').eq('id', users[0]['rol']).execute().data if users else []
        if not roles or roles[0]['nombre'].strip().lower() != 'tatuador':
            raise HTTPException(422, 'Selecciona un tatuador válido.')
        nota = ' '.join((data.nota or '').split()) or None
        row = db.table('pagos_arriendo').insert({
            'tatuador': str(data.tatuadorId), 'periodo': arriendos.month_start(data.periodo), 'monto': data.monto,
            'pagado_en': data.pagadoEn.isoformat(), 'nota': nota, 'registrado_por': admin['id'],
        }).execute().data
        log_event(admin, 'arriendo', 'pago_registrado',
                  f"Registró un pago de {actividad.price(data.monto)} de {users[0]['nombre']} para el arriendo de "
                  f"{actividad.month_name(data.periodo)}.", row[0]['id'],
                  {'monto': data.monto, 'pagadoEn': data.pagadoEn.isoformat(), 'nota': nota})
        return {'id': row[0]['id']}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, 'No se pudo registrar el pago. Comprueba la migración 013.') from exc


@app.delete('/api/arriendos/pagos/{pago_id}')
def delete_rent_payment(pago_id: UUID, admin=Depends(require_admin)):
    try:
        db = client(admin=True)
        deleted = db.table('pagos_arriendo').delete().eq('id', str(pago_id)).execute().data
    except Exception as exc:
        raise HTTPException(503, 'No se pudo borrar el pago.') from exc
    if not deleted:
        raise HTTPException(404, 'El pago ya no existe.')
    pago = deleted[0]
    log_event(admin, 'arriendo', 'pago_borrado',
              f"Borró un pago de {actividad.price(pago.get('monto'))} de {user_name(db, pago.get('tatuador'))} del arriendo de "
              f"{actividad.month_name(str(pago.get('periodo')))} (pagado el {actividad.short_date(str(pago.get('pagado_en')))}).", pago_id,
              {'monto': pago.get('monto'), 'nota': pago.get('nota')})
    return {'ok': True}


# ---------- Registro manual de usuarios (commit "Registro") ----------
# Crea la cuenta en Auth con el correo ya confirmado, para que pueda entrar de inmediato con esa contraseña.
# El trigger de la migración 001 crea su perfil en usuarios (como tatuador, activo y con la modalidad
# de los metadatos); después se ajustan el nombre y el rol elegido. Si el perfil falla, se borra la cuenta.
@app.post("/api/usuarios/", status_code=201)
def user_create(new_user: CreateUser, admin=Depends(require_admin)):
    nombre = " ".join(new_user.nombre.split())
    email = new_user.email.strip().lower()
    if not nombre:
        raise HTTPException(422, "El nombre es obligatorio.")
    db = client(admin=True)
    try:
        roles = {r["id"]: r["nombre"].strip().lower() for r in db.table("rol").select("id,nombre").execute().data}
        modalidades = modality_names(db)
    except Exception as exc:
        raise HTTPException(503, "No se pudieron consultar los roles y modalidades.") from exc
    rol = roles.get(new_user.rol)
    if rol not in ("admin", "tatuador"):
        raise HTTPException(422, "Selecciona un rol válido.")
    # Solo los tatuadores tienen modalidad (define su arriendo).
    modalidad = new_user.modalidad if rol == "tatuador" else None
    if rol == "tatuador" and modalidad is None:
        raise HTTPException(422, "Selecciona la modalidad del tatuador.")
    if modalidad is not None and modalidad not in modalidades:
        raise HTTPException(422, "Selecciona una modalidad válida.")
    try:
        auth_result = db.auth.admin.create_user({
            "email": email,
            "password": new_user.password,
            "email_confirm": True,
            "user_metadata": {"nombre": nombre, "modalidad": modalidad},
        })
    except Exception as exc:
        text = str(exc).lower()
        if "already" in text or "registered" in text or "exists" in text:
            raise HTTPException(409, "Ya existe una cuenta con ese correo.") from exc
        if "password" in text:
            raise HTTPException(422, "La contraseña no cumple los requisitos de seguridad.") from exc
        raise HTTPException(400, "No se pudo crear la cuenta. Revisa el correo y la contraseña.") from exc
    user_id = str(auth_result.user.id)
    try:
        updated = db.table("usuarios").update({"nombre": nombre, "rol": new_user.rol, "activo": True}).eq("id", user_id).execute().data
        if not updated:
            db.table("usuarios").insert({"id": user_id, "nombre": nombre, "rol": new_user.rol,
                                         "modalidad": modalidad, "activo": True}).execute()
    except Exception as exc:
        try:
            db.auth.admin.delete_user(user_id)
        except Exception:
            pass
        raise HTTPException(503, "No se pudo crear el perfil del usuario. No se guardó nada; intenta nuevamente.") from exc
    log_event(admin, "tatuador", "registro",
              f"Registró a {nombre} ({email}) como {rol}" + (f" con modalidad {modalidades.get(modalidad)}." if modalidad else "."), user_id)
    return {"message": f"{nombre} quedó registrado como {rol}. Ya puede iniciar sesión con su correo y contraseña.",
            "id": user_id, "rol": new_user.rol, "modalidad": modalidad}


# ---------- Registro de actividad (solo admin) ----------
TEXT_FILTER = re.compile(r"[^\w\s@.\-]")


@app.get('/api/actividad')
def activity_log(
    categoria: Literal['reserva', 'sesion', 'puesto', 'tatuador', 'arriendo'] | None = None,
    actor: UUID | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    q: str | None = Query(default=None, max_length=80),
    antes: int | None = Query(default=None, gt=0),
    limite: int = Query(default=50, ge=1, le=100),
    admin=Depends(require_admin),
):
    """Registros del más nuevo al más antiguo. `antes` es el id del último registro ya mostrado (página siguiente)."""
    try:
        query = (client(admin=True).table('registro_actividad_local')
                 .select('id,creado_en,fecha_local,actor,actor_nombre,actor_rol,categoria,accion,entidad_id,resumen,detalle'))
        if categoria:
            query = query.eq('categoria', categoria)
        if actor:
            query = query.eq('actor', str(actor))
        if desde:
            query = query.gte('fecha_local', desde.isoformat())
        if hasta:
            query = query.lte('fecha_local', hasta.isoformat())
        # Texto libre: en el resumen o en el nombre de quien lo hizo (sin caracteres que rompan el filtro).
        texto = ' '.join(TEXT_FILTER.sub(' ', q or '').split())
        if texto:
            query = query.or_(f'resumen.ilike.*{texto}*,actor_nombre.ilike.*{texto}*')
        if antes:
            query = query.lt('id', antes)
        rows = query.order('id', desc=True).limit(limite + 1).execute().data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, 'No se pudo cargar la actividad. Comprueba la migración 014 en Supabase.') from exc
    return {'registros': rows[:limite], 'hayMas': len(rows) > limite}
