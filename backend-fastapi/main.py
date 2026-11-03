import json
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, status
from supabase import create_client, Client
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from typing import Optional
import os

load_dotenv()

app = FastAPI()
usuarios_mock_path = Path(__file__).parent / "data" / "usuariosMock.json"

supabase: Client = create_client(
    os.environ.get("SUPABASE_URL"),
    os.environ.get("SUPABASE_PUBLISHABLE_KEY")
)

origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    email: str
    password: str

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login")
def login(data: LoginRequest):
    # Credenciales de prueba local; no constituyen autenticación de producción.
    usuarios_mock = json.loads(usuarios_mock_path.read_text(encoding="utf-8"))
    for usuario in usuarios_mock:
        if data.email == usuario["email"] and data.password == usuario["password"]:
            return {
                "message": "Login exitoso",
                "user": {key: usuario[key] for key in ("id", "name", "role")},
            }
    raise HTTPException(status_code=401, detail="Credenciales inválidas")

async def get_current_user():
    user = supabase.auth.get.user()
    if not user:
        raise HTTPException(
            status_code=stattus.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={WWW-AUTHENTICATE:"Bearer"},
        )
    return user

@app.get("/api/rol/")
async def get_roles():
        response = supabase.table("rol").select("*").execute()
        return response.data
@app.get("/api/usuarios/")
async def get_usuario():
        response = supabase.table("usuarios").select("*").execute()
        return response.data
@app.get("/api/modalidad/")
async def get_modalidad():
        response = supabase.table("modalidad").select("*").execute()
        return response.data
@app.get("/api/cliente/")
async def get_cliente():
        response = supabase.table("cliente").select("*").execute()
        return response.data
@app.get("/api/documentos/")
async def get_roles():
        response = supabase.table("documentos").select("*").execute()
        return response.data
@app.get("/api/espacio/")
async def get_roles():
        response = supabase.table("espacio").select("*").execute()
        return response.data

@app.get("/sign_up")
def sign_up():
    response = supa.auth.sign_up(email="testcorreo@gmail.com",
                                 password="testsupabasenow")
    return response.get("access_token")

@app.get("/sign_out")
def sign_out():
    supabase = init_supabase()
    response = supabase.auth.sign_out()
    return "success"

@app.get("/sign_in")
def sign_in():
    supabase = init_supabase()
    response = supabase.auth.sign_in_with_password({"email":"testcorreo@gmail.com", "password": "testsupabasenow"})
    return res.get("access_token")

@app.get("/reset_password")
def reset_password():
    supabase = init_supabase()
    reset_password = client.auth.reset_password_email('valid.email@supabase.to',{ 
                                                    'redirect_to':'http://example.com/account/update-password'})
    return res.get("")
@app.get("/confirm_password")
def confirm_password():
    supabase = init_supabase()
    response = supabase.auth.update_user({'password':"new_password"})
