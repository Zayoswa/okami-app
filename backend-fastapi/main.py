from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

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


@app.post('/auth/login')
def login(data:LoginRequest):
    # Estos datos son MOCK UP. ES PARA VALIDAR.
    if data.email == 'admin@okami.cl' and data.password == 'admin':
        return {
            'message': 'Login exitoso',
            'user': {
                'id': 1,
                'name': 'Admin Demo',
                'role': 'admin'
            }
        }
    raise HTTPException(status_code=401, detail='Credenciales inválidas')


