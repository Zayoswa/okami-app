"""PDF del consentimiento informado: escribe los datos sobre la plantilla (plantillas/consentimiento.pdf).

La plantilla es un PDF plano de una página tamaño carta (612 x 792 pt), sin campos rellenables.
Los datos se dibujan con reportlab en una capa transparente que se superpone a la plantilla con pypdf.
Las coordenadas salen de las etiquetas de la plantilla (pt desde la esquina inferior izquierda): el valor de
cada campo va en la línea de abajo de su etiqueta. Si se cambia la plantilla, hay que revisar POSICIONES.
"""
from datetime import date
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

PLANTILLA = Path(__file__).resolve().parent / 'plantillas' / 'consentimiento.pdf'
FUENTE, NEGRITA = 'Helvetica', 'Helvetica-Bold'
TINTA = HexColor('#111111')
TAMANO = 8  # pt de los valores

# Columnas de los datos personales (x de inicio y ancho disponible).
TATUADOR, CLIENTE, REPRESENTANTE = (28.3, 175), (214.5, 165), (389.5, 194)
# Línea de cada dato (la etiqueta está 8.5 pt más arriba).
Y_NOMBRE, Y_RUT, Y_NACIMIENTO, Y_TELEFONO, Y_DIRECCION = 705.5, 682.9, 660.2, 637.5, 614.8
# Marcadores "—" de la plantilla vacía que se tapan antes de escribir.
GUIONES = [(28.3, 682.9), (28.3, 660.2), (319.3, 660.2), (28.3, 637.5)]
# Pie de firmas: centro de cada columna, y línea de los "No aplica" de la plantilla.
FIRMAS_Y = 29.5
FIRMAS = [(93.9, 'Firma tatuador'), (275.5, 'Firma Cliente'), (434.8, 'Firma representante legal')]


def formato_rut(rut):
    """12345678K → 12.345.678-K."""
    rut = (rut or '').upper()
    if len(rut) < 2:
        return rut
    cuerpo, dv = rut[:-1], rut[-1]
    return f'{int(cuerpo):,}'.replace(',', '.') + f'-{dv}'


def formato_fecha(valor):
    if not valor:
        return ''
    valor = valor if isinstance(valor, date) else date.fromisoformat(str(valor)[:10])
    return valor.strftime('%d-%m-%Y')


def edad(nacimiento, fecha):
    if not nacimiento:
        return None
    nacimiento = nacimiento if isinstance(nacimiento, date) else date.fromisoformat(str(nacimiento)[:10])
    fecha = fecha if isinstance(fecha, date) else date.fromisoformat(str(fecha)[:10])
    return fecha.year - nacimiento.year - ((fecha.month, fecha.day) < (nacimiento.month, nacimiento.day))


def ajustar(texto, ancho, tamano=TAMANO, fuente=FUENTE):
    """Recorta el texto para que quepa en `ancho` pt (agrega … si se corta)."""
    texto = ' '.join(str(texto or '').split())
    if stringWidth(texto, fuente, tamano) <= ancho:
        return texto
    while texto and stringWidth(texto + '…', fuente, tamano) > ancho:
        texto = texto[:-1]
    return texto.rstrip() + '…'


def lineas(texto, ancho, maximo, tamano=7.5):
    """Parte el texto en líneas de hasta `ancho` pt, palabra por palabra; la última lleva … si sobra texto."""
    partes, actual = [], ''
    for palabra in str(texto or '').split():
        prueba = f'{actual} {palabra}'.strip()
        if stringWidth(prueba, FUENTE, tamano) <= ancho or not actual:
            actual = prueba
        else:
            partes.append(actual)
            actual = palabra
    if actual:
        partes.append(actual)
    partes = [ajustar(linea, ancho, tamano) for linea in partes]
    if len(partes) > maximo:
        partes = partes[:maximo]
        partes[-1] = ajustar(partes[-1] + ' ' + '…' * 40, ancho, tamano)
    return partes


def tapar(c, x, y, ancho, alto=9.5):
    """Rectángulo blanco sobre un texto de la plantilla (y = línea base del texto)."""
    c.setFillColor(white)
    c.rect(x - 0.5, y - 2.5, ancho + 1, alto, stroke=0, fill=1)
    c.setFillColor(TINTA)


def escribir(c, x, y, texto, ancho, tamano=TAMANO, fuente=FUENTE):
    if texto:
        c.setFont(fuente, tamano)
        c.drawString(x, y, ajustar(texto, ancho, tamano, fuente))


def capa(datos):
    """Página transparente con los datos del consentimiento, del mismo tamaño que la plantilla."""
    salida = BytesIO()
    c = canvas.Canvas(salida, pagesize=(612, 792))
    c.setFillColor(TINTA)

    for x, y in GUIONES:
        tapar(c, x, y, 10)

    # Folio (en su recuadro) y fecha (a la derecha, bajo el recuadro del folio).
    folio = f"{int(datos['folio']):06d}"
    c.setFont(NEGRITA, 10)
    c.drawCentredString(518, 760.8, folio)
    tapar(c, 500, 739.6, 84)
    c.setFont(NEGRITA, 8)
    c.drawRightString(583.7, 739.6, f"FECHA: {formato_fecha(datos['fecha'])}")

    # Tatuador
    x, ancho = TATUADOR
    escribir(c, x, Y_NOMBRE, datos.get('tatuador_nombre'), ancho)
    escribir(c, x, Y_RUT, formato_rut(datos.get('tatuador_rut')), ancho)
    escribir(c, x, Y_NACIMIENTO, formato_fecha(datos.get('tatuador_nacimiento')), ancho)
    escribir(c, x, Y_TELEFONO, datos.get('tatuador_telefono'), ancho)

    # Cliente (la edad va en su propia columna, x 319.3)
    x, ancho = CLIENTE
    escribir(c, x, Y_NOMBRE, datos.get('cliente_nombre'), ancho)
    escribir(c, x, Y_RUT, formato_rut(datos.get('cliente_rut')), ancho)
    escribir(c, x, Y_NACIMIENTO, formato_fecha(datos.get('cliente_nacimiento')), 100)
    anos = edad(datos.get('cliente_nacimiento'), datos['fecha'])
    escribir(c, 319.3, Y_NACIMIENTO, f'{anos} años' if anos is not None else '', 60)
    escribir(c, x, Y_TELEFONO, datos.get('cliente_telefono'), ancho)
    for i, linea in enumerate(lineas(datos.get('cliente_direccion'), ancho, 2, TAMANO)):
        c.setFont(FUENTE, TAMANO)
        c.drawString(x, Y_DIRECCION - i * 9, linea)

    # Representante (solo si hay; si no, "No aplica")
    x, ancho = REPRESENTANTE
    if datos.get('representante_nombre'):
        escribir(c, x, Y_NOMBRE, datos.get('representante_nombre'), ancho)
        escribir(c, x, Y_RUT, formato_rut(datos.get('representante_rut')), ancho)
        escribir(c, x, Y_NACIMIENTO, formato_fecha(datos.get('representante_nacimiento')), ancho)
        escribir(c, x, Y_TELEFONO, datos.get('representante_telefono'), ancho)
    else:
        c.setFillColor(HexColor('#8a8a8a'))
        escribir(c, x, Y_NOMBRE, 'No aplica (cliente mayor de edad)', ancho, 7.5)
        c.setFillColor(TINTA)

    # Trabajo a realizar: descripción y condiciones en 2 líneas como máximo.
    c.setFont(FUENTE, 7)
    for i, linea in enumerate(lineas(datos.get('descripcion'), 268, 2, 7)):
        c.drawString(28.3, 576.3 - i * 7.6, linea)
    for i, linea in enumerate(lineas(datos.get('condiciones') or 'Sin condiciones informadas.', 268, 2, 7)):
        c.drawString(28.3, 553.4 - i * 7.6, linea)
    escribir(c, 306.1, 575.3, datos.get('zona_cuerpo'), 278)
    escribir(c, 306.1, 552.6, datos.get('tipo_tatuaje'), 278)

    # Firmas: el nombre de quien firma reemplaza el "No aplica" de la plantilla.
    nombres = [datos.get('tatuador_nombre'), datos.get('cliente_nombre'), datos.get('representante_nombre')]
    for (x_titulo, titulo), nombre in zip(FIRMAS, nombres):
        centro = x_titulo + stringWidth(titulo, FUENTE, 7.5) / 2
        tapar(c, centro - 30, FIRMAS_Y, 60, 8)
        c.setFont(FUENTE, 6.5)
        if nombre:
            c.drawCentredString(centro, FIRMAS_Y, ajustar(nombre, 150, 6.5))
        else:
            c.setFillColor(HexColor('#8a8a8a'))
            c.drawCentredString(centro, FIRMAS_Y, 'No aplica')
            c.setFillColor(TINTA)

    # Pie: "Folio: 000123 | 09-11-2026 | Estudio Okami"
    pie_viejo = 'Folio:   |      |  Estudio Okami'
    centro = 260.1 + stringWidth(pie_viejo, FUENTE, 6) / 2
    tapar(c, 200, 9.6, 212, 8)
    c.setFillColor(HexColor('#8a8a8a'))
    c.setFont(FUENTE, 6)
    c.drawCentredString(centro, 9.6, f"Folio: {folio}  |  {formato_fecha(datos['fecha'])}  |  Estudio Okami")

    c.showPage()
    c.save()
    return salida.getvalue()


def generar(datos):
    """Bytes del PDF final: la plantilla con los datos encima."""
    escritor = PdfWriter(clone_from=PLANTILLA)
    escritor.pages[0].merge_page(PdfReader(BytesIO(capa(datos))).pages[0])
    escritor.add_metadata({'/Title': f"Consentimiento informado - Folio {int(datos['folio']):06d}", '/Author': 'Estudio Okami'})
    salida = BytesIO()
    escritor.write(salida)
    return salida.getvalue()
