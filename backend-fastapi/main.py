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

load_dotenv(Path(__file__).with_name(".env"))
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
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

class CreateUser(BaseModel):
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=254)
    nombre: str = Field(min_length=1, max_length=120)
    rol: int 
    modalidad: int | None 
    activo: bool = Field(default=False)



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


class ReservationRequest(BaseModel):
    clienteId: UUID | None = None
    clienteNombre: str | None = Field(default=None, max_length=120)
    # RUT completo con dígito verificador; se aceptan puntos, guion y espacios (ej. 12.345.678-K).
    clienteRut: str | None = Field(default=None, max_length=16)
    tatuadorId: UUID
    espacioId: int = Field(gt=0)
    precio: int = Field(ge=0, le=9007199254740991)
    fecha: date
    horaInicio: str = Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
    horaFin: str = Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
    estado: Literal['Pendiente', 'Confirmada', 'Cancelado', 'Completado']


class ReservationCreate(ReservationRequest):
    id: UUID


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


@app.get("/api/espacios")
def spaces(user=Depends(get_current_user)):
    try:
        db = client(admin=True)
        states = {row["id"]: row["estado"].strip() for row in db.table("espacio_estados").select("id,estado").execute().data}
        rows = db.table("espacio").select("id,nombre,capacidad,estado_id").order("nombre").execute().data
        result = []
        used = set()
        for row in rows:
            # Compatibilidad con las reservas locales, que guardan A–F.
            legacy = re.fullmatch(r"Espacio ([A-F])", row["nombre"], re.IGNORECASE)
            code = legacy[1].upper() if legacy else f"db:{row['id']}"
            if code in used or not isinstance(row["capacidad"], int) or row["capacidad"] < 1:
                raise HTTPException(503, "Hay espacios duplicados o con capacidad inválida. Revisa el catálogo.")
            used.add(code)
            state = states.get(row["estado_id"], "Sin estado")
            available = state.casefold() in ("habilitado", "habiltado")
            result.append({"id": code, "idBaseDatos": str(row["id"]), "nombre": row["nombre"], "capacidadMaxima": row["capacidad"], "estado": state, "disponible": available})
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "No se pudieron cargar los espacios de Supabase.") from exc


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
    return {"message": "Invitación enviada."}


@app.patch("/api/usuarios/{user_id}/actividad")
def activity(user_id: UUID, data: ActiveRequest, admin=Depends(require_admin)):
    db = client(admin=True)
    rows = db.table("usuarios").select("id,rol").eq("id", str(user_id)).execute().data
    if not rows:
        raise HTTPException(404, "Usuario no encontrado.")
    roles = db.table("rol").select("nombre").eq("id", rows[0]["rol"]).execute().data
    if not roles or roles[0]["nombre"].strip().lower() != "tatuador":
        raise HTTPException(403, "Este módulo solo modifica el acceso de tatuadores.")
    db.table("usuarios").update({"activo": data.activo}).eq("id", str(user_id)).execute()
    return {"ok": True}


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
            artists = db.table('usuarios').select('id,nombre').in_('rol', role_ids).eq('activo', True).order('nombre').execute().data if role_ids else []
        return {'tatuadores': artists}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, 'No se pudieron cargar los clientes y tatuadores.') from exc


@app.get('/api/clientes')
def search_customers(
    busqueda: str = Query(min_length=2, max_length=120),
    user=Depends(get_current_user),
):
    return reservation_rpc('okami_buscar_clientes', {'p_actor': user['id'], 'p_busqueda': busqueda.strip()})


def normalize_rut(value):
    """Forma canónica del RUT: solo dígitos y K mayúscula, sin puntos ni guion (ej. 12345678K)."""
    return re.sub(r'[^0-9K]', '', (value or '').upper())


def rut_error(rut):
    if not rut:
        return 'Ingresa el RUT del cliente con su dígito verificador.'
    if not re.fullmatch(r'\d{1,9}[0-9K]', rut) or set(rut[:-1]) == {'0'}:
        return 'Ingresa un RUT válido, por ejemplo 12.345.678-5.'
    total = sum(int(digit) * (2 + index % 6) for index, digit in enumerate(reversed(rut[:-1])))
    expected = {11: '0', 10: 'K'}.get(11 - total % 11, str(11 - total % 11))
    if rut[-1] != expected:
        return 'El dígito verificador no corresponde al RUT ingresado.'
    return ''


def write_reservation(operation, reservation_id, data, user):
    params = {'p_actor': user['id'], 'p_operacion': operation, 'p_id': str(reservation_id)}
    if data is not None:
        if time.fromisoformat(data.horaFin) <= time.fromisoformat(data.horaInicio):
            raise HTTPException(422, 'La hora de término debe ser posterior a la de inicio.')
        rut = None
        if not data.clienteId:
            rut = normalize_rut(data.clienteRut)
            error = rut_error(rut)
            if error:
                raise HTTPException(422, error)
        params.update(p_cliente=str(data.clienteId) if data.clienteId else None,
                      p_cliente_nombre=data.clienteNombre.strip() if data.clienteNombre else None,
                      p_cliente_rut=rut,
                      p_tatuador=str(data.tatuadorId), p_espacio=data.espacioId,
                      p_precio=data.precio, p_inicio=f'{data.fecha}T{data.horaInicio}',
                      p_fin=f'{data.fecha}T{data.horaFin}', p_estado=data.estado)
    return {'id': reservation_rpc('okami_mutar_reserva_cliente_rut', params)}


@app.post('/api/reservas', status_code=201)
def create_reservation(data: ReservationCreate, user=Depends(get_current_user)):
    return write_reservation('crear', data.id, data, user)


@app.patch('/api/reservas/{reservation_id}')
def edit_reservation(reservation_id: UUID, data: ReservationRequest, user=Depends(get_current_user)):
    return write_reservation('editar', reservation_id, data, user)


@app.delete('/api/reservas/{reservation_id}')
def delete_reservation(reservation_id: UUID, user=Depends(get_current_user)):
    return write_reservation('borrar', reservation_id, None, user)

@app.post("/api/usuarios/")
def user_create(
    new_user: CreateUser,
    admin=Depends(require_admin)
    ):
    print("POST REACHED")
    try:
        auth_result = supabase.auth.admin.create_user({
            "email": new_user.email,
            "password": new_user.password,
            "email_confirm": False
        })
        user_id = auth_result.user.id
        db = client(admin=True)
        new_user_in_table = db.table(
            "usuarios"
        ).insert({
            "id": str(user_id),                    
            "rol":  new_user.rol,
            "modalidad": new_user.modalidad,
            "nombre": new_user.nombre,
            "activo": new_user.activo
        }).execute()

        return {
            "message": "Usuario creado exitosamente",
                "id": str(user_id),
                "rol": new_user.rol,
                "modalidad": new_user.modalidad
                }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, "No se pudo realizar la operación de registro") from exc

