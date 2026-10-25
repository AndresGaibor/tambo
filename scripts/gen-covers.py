#!/usr/bin/env python3
"""
Genera las portadas SVG de Tambo (720x240, 3:1) para las 11 apps.

Lenguaje visual común: superficie oscura, escena line-art de la función de
cada app en el color de su grupo, un acento dorado (inti) por composición y
sin texto ni patrones repetidos. Salida: data/assets/covers/<glifo>.svg.

Uso: python3 scripts/gen-covers.py   (desde la raíz del repo tambo)
"""

W, H = 720, 240
GOLD = "#F5B83D"
GOLD_DIM = "#8A6A2A"
INK = "#8A92A6"
INK_DIM = "#4A5164"

# Colores de grupo (tema oscuro)
C = {"gold": "#F5B83D", "teal": "#2DD4BF", "indigo": "#818CF8"}

# Colores de marca de la tecnologia de cada app, cuando existe.
REACT = "#61DAFB"
CLERK = "#6C47FF"
POSTGRES = "#699ECA"
STORYBOOK = "#FF4785"

SURFACE_TOP = "#161A23"
SURFACE_BOT = "#0F1218"


def svg_open(color):
    cid = f"g-{color.lstrip('#')}"
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img">',
        "<defs>",
        f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{SURFACE_TOP}"/>'
        f'<stop offset="1" stop-color="{SURFACE_BOT}"/></linearGradient>',
        f'<radialGradient id="{cid}" cx="0.72" cy="0.9" r="0.85">'
        f'<stop offset="0" stop-color="{color}" stop-opacity="0.16"/>'
        f'<stop offset="0.55" stop-color="{color}" stop-opacity="0.05"/>'
        f'<stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient>',
        "</defs>",
        f'<rect width="{W}" height="{H}" fill="url(#bg)"/>',
        f'<rect width="{W}" height="{H}" fill="url(#{cid})"/>',
        # Línea de suelo: apoya la escena sin cerrarla
        f'<path d="M60 {H-46} H {W-60}" stroke="{INK_DIM}" stroke-opacity="0.55" '
        'stroke-width="1.5" stroke-linecap="round"/>',
    ]


def g(stroke, width=3, opacity=1.0, fill="none"):
    return (f'<g fill="{fill}" stroke="{stroke}" stroke-width="{width}" '
            f'stroke-opacity="{opacity}" stroke-linecap="round" stroke-linejoin="round">')


S = []  # acumulador simple


def add(*parts):
    S.extend(parts)


def rrect(x, y, w, h, rx=10, **kw):
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>')


def circle(cx, cy, r, **kw):
    add(f'<circle cx="{cx}" cy="{cy}" r="{r}"/>')


def line(x1, y1, x2, y2, **kw):
    add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')


def path(d, **kw):
    add(f'<path d="{d}"/>')


def poly(pts, close=True, **kw):
    d = "M " + " L ".join(f"{x} {y}" for x, y in pts)
    if close:
        d += " Z"
    path(d)


def spark(x, y, r=7, color=GOLD, opacity=0.9, width=2.5):
    """Chispa de cuatro puntas: el acento inti de Tambo."""
    return (f'<path d="M {x} {y-r} Q {x} {y} {x+r} {y} Q {x} {y} {x} {y+r} '
            f'Q {x} {y} {x-r} {y} Q {x} {y} {x} {y-r}" fill="{color}" '
            f'fill-opacity="{opacity}" stroke="none"/>')


# ---------- Escenas (720x240; suelo en y=194) ----------

def escena_erp():
    add(g(REACT))
    # Terminal POS
    rrect(300, 58, 150, 100, 14)
    rrect(314, 72, 122, 44, 8)
    add(f'<rect x="314" y="72" width="122" height="44" rx="8" fill="{C["gold"]}" fill-opacity="0.10"/>')
    line(324, 84, 380, 84)
    line(324, 96, 366, 96)
    line(324, 108, 392, 108)
    # Teclado
    for i in range(4):
        circle(328 + i * 30, 136, 5)
    # Gaveta de dinero
    rrect(310, 164, 130, 30, 8)
    line(375, 164, 375, 194)
    circle(390, 179, 4)
    # Ticket
    poly([(455, 70), (515, 70), (515, 150), (500, 140), (485, 152), (470, 140), (455, 150)])
    for yy in (86, 102, 118, 134):
        line(467, yy, 503, yy)
    # Monedas apiladas
    for i, (cx, cy) in enumerate([(560, 186), (560, 174), (560, 162)]):
        add(f'<ellipse cx="{cx}" cy="{cy}" rx="24" ry="8"/>')
    add(g_close())
    # Atomo de React: nucleo y tres orbitos
    add(f'<g fill="none" stroke="{REACT}" stroke-width="2.2" stroke-opacity="0.9">'
        f'<ellipse cx="228" cy="120" rx="34" ry="13"/>'
        f'<ellipse cx="228" cy="120" rx="34" ry="13" transform="rotate(60 228 120)"/>'
        f'<ellipse cx="228" cy="120" rx="34" ry="13" transform="rotate(120 228 120)"/>'
        f'</g>')
    add(f'<circle cx="228" cy="120" r="6" fill="{REACT}"/>')


def escena_admin():
    add(g(CLERK))
    # Escudo central
    path("M 340 66 L 400 84 L 400 128 Q 400 166 340 188 Q 280 166 280 128 L 280 84 Z")
    path("M 340 78 L 388 92 L 388 126 Q 388 156 340 176 Q 292 156 292 126 L 292 92 Z",
         )
    add(f'<path d="M 340 78 L 388 92 L 388 126 Q 388 156 340 176 Q 292 156 292 126 L 292 92 Z" '
        f'fill="{C["gold"]}" fill-opacity="0.08"/>')
    # Check dentro del escudo
    path("M 322 128 L 336 142 L 360 112")
    # Slider de permisos a la derecha
    rrect(452, 92, 150, 26, 13)
    circle(486, 105, 9)
    rrect(452, 136, 150, 26, 13)
    circle(568, 149, 9)
    # Llave
    circle(508, 108, 12)
    line(518, 116, 546, 144)
    line(538, 152, 546, 144)
    line(532, 138, 540, 130)
    add(g_close())


def escena_api():
    add(g(POSTGRES))
    # Base de datos: cilindros apilados
    for y in (88, 118, 148):
        add(f'<path d="M 330 {y} Q 330 {y+14} 360 {y+14} L 470 {y+14} '
            f'Q 500 {y+14} 500 {y}"/>')
        add(f'<path d="M 330 {y} Q 330 {y-14} 360 {y-14} L 470 {y-14} '
            f'Q 500 {y-14} 500 {y}"/>')
    add(f'<ellipse cx="400" cy="74" rx="85" ry="14" fill="{POSTGRES}" fill-opacity="0.12"/>')
    # Consulta entrante y filas salientes
    line(244, 118, 296, 118)
    circle(244, 118, 8)
    path("M 296 118 L 316 118 Q 326 118 326 108")
    line(500, 118, 552, 118)
    circle(564, 118, 8)
    # Paquetes
    rrect(216, 92, 24, 24, 6)
    rrect(198, 130, 18, 18, 5)
    rrect(588, 96, 22, 22, 6)
    rrect(612, 128, 16, 16, 5)
    add(g_close())


def escena_storybook():
    add(g(STORYBOOK))
    # Libro oficial estilizado
    path("M 342 64 Q 336 60 328 62 L 296 70 L 296 178 L 328 170 Q 336 168 342 172 "
         "Q 348 168 356 170 L 388 178 L 388 70 L 356 62 Q 348 60 342 64 Z")
    line(342, 64, 342, 172)
    # S del logo oficial (aproximación tipográfica propia)
    path("M 352 96 Q 344 88 334 92 Q 324 96 326 106 Q 328 114 340 117 Q 352 120 354 130 "
         "Q 356 140 346 144 Q 336 148 328 140",
         )
    add(f'<path d="M 342 64 Q 336 60 328 62 L 296 70 L 296 178 L 328 170 Q 336 168 342 172 '
        f'Q 348 168 356 170 L 388 178 L 388 70 L 356 62 Q 348 60 342 64 Z" '
        f'fill="#FF4785" fill-opacity="0.08"/>')
    # Marco de UI con componentes
    rrect(440, 78, 150, 92, 12)
    rrect(452, 90, 58, 26, 6)
    circle(528, 103, 13)
    rrect(452, 126, 126, 8, 4)
    rrect(452, 144, 96, 8, 4)
    # Marcador de capas
    poly([(600, 96), (622, 96), (622, 170), (611, 160), (600, 170)])
    add(g_close())


def escena_assistant():
    add(g(C["gold"]))
    # Teléfono
    rrect(318, 54, 104, 140, 18)
    line(352, 66, 388, 66)
    add(f'<rect x="318" y="54" width="104" height="140" rx="18" fill="{C["gold"]}" fill-opacity="0.06"/>')
    # Burbuja entrante
    rrect(276, 88, 84, 40, 14)
    path("M 292 128 L 292 144 L 308 128")
    for i in range(3):
        circle(296 + i * 20, 108, 4)
    # Burbuja saliente con chispa IA
    rrect(372, 128, 90, 44, 14)
    path("M 434 172 L 434 188 L 418 172")
    add(spark(404, 150, 9))
    add(spark(434, 136, 6, opacity=0.7))
    # Puntos de escritura
    circle(396, 168, 4)
    circle(412, 168, 4)
    add(g_close())


def escena_delegation():
    add(g(C["teal"]))
    # Nodo raíz
    rrect(336, 62, 120, 40, 12)
    add(f'<rect x="336" y="62" width="120" height="40" rx="12" fill="{C["teal"]}" fill-opacity="0.10"/>')
    line(396, 102, 396, 124)
    path("M 288 124 L 504 124")
    line(288, 124, 288, 146)
    line(396, 124, 396, 146)
    line(504, 124, 504, 146)
    # Tres delegaciones
    for x in (232, 340, 448):
        rrect(x, 146, 112, 38, 12)
    # Estados: activa, activa, en curso
    circle(248, 165, 5)
    line(262, 165, 326, 165)
    circle(356, 165, 5)
    line(370, 165, 434, 165)
    circle(464, 165, 5)
    path("M 478 165 L 500 165")
    add(g_close())


def escena_titula():
    add(g(C["teal"]))
    # Documento principal
    poly([(340, 58), (412, 58), (436, 82), (436, 182), (340, 182)])
    path("M 412 58 L 412 82 L 436 82")
    add(f'<path d="M 340 58 L 412 58 L 436 82 L 436 182 L 340 182 Z" '
        f'fill="{C["teal"]}" fill-opacity="0.06"/>')
    for yy in (100, 118, 136):
        line(358, yy, 418, yy)
    line(358, 154, 396, 154)
    # Checklists laterales
    for x in (256, 486):
        rrect(x, 92, 92, 56, 10)
        path(f"M {x+14} 110 L {x+22} 118 L {x+36} 102")
        line(x + 48, 110, x + 78, 110)
        path(f"M {x+14} 130 L {x+22} 138 L {x+36} 122")
        line(x + 48, 130, x + 78, 130)
    # Sello de validación
    circle(486, 170, 12)
    path("M 480 170 L 485 175 L 493 165")
    add(g_close())


def escena_billing():
    add(g(C["indigo"]))
    # Factura
    poly([(322, 54), (420, 54), (420, 186), (404, 174), (388, 186), (372, 174), (356, 186), (340, 174), (322, 186)])
    add(f'<path d="M 322 54 L 420 54 L 420 186 L 404 174 L 388 186 L 372 174 L 356 186 '
        f'L 340 174 L 322 186 Z" fill="{C["indigo"]}" fill-opacity="0.06"/>')
    line(342, 78, 400, 78)
    line(342, 96, 386, 96)
    line(342, 114, 400, 114)
    line(342, 132, 374, 132)
    # Total
    rrect(342, 146, 62, 20, 6)
    # Moneda y firma
    circle(466, 118, 22)
    path("M 466 104 L 466 132 M 458 110 Q 466 104 474 110 M 458 126 Q 466 132 474 126")
    path("M 500 148 Q 522 128 546 144 Q 570 158 592 140")
    add(g_close())


def escena_presentation():
    add(g(C["indigo"]))
    # Pantalla
    rrect(300, 60, 240, 130, 14)
    add(f'<rect x="300" y="60" width="240" height="130" rx="14" fill="{C["indigo"]}" fill-opacity="0.06"/>')
    # Gráfico ascendente dentro
    poly([(326, 162), (372, 128), (414, 142), (470, 98), (516, 110)], close=False)
    circle(516, 110, 6)
    for i, x in enumerate((336, 392, 448)):
        line(x, 74, x, 80)
    # Pie y proyector
    line(420, 190, 420, 200)
    line(390, 202, 450, 202)
    # Puntero
    path("M 540 78 L 560 78 M 540 78 L 540 98")
    add(g_close())


def escena_api_docs():
    add(g(C["indigo"]))
    # Libro abierto
    path("M 372 72 Q 360 64 344 68 L 306 78 L 306 178 L 344 168 Q 360 164 372 172 "
         "Q 384 164 400 168 L 438 178 L 438 78 L 400 68 Q 384 64 372 72 Z")
    line(372, 72, 372, 172)
    for yy in (100, 120, 140):
        line(326, yy, 358, yy)
        line(388, yy, 422, yy)
    # Llaves de contrato
    path("M 486 96 L 476 106 L 476 118 L 466 128 L 476 138 L 476 150 L 486 160")
    path("M 516 96 L 526 106 L 526 118 L 536 128 L 526 138 L 526 150 L 516 160")
    line(470, 128, 490, 128)
    # Marcador de sección
    poly([(568, 92), (596, 92), (596, 168), (582, 156), (568, 168)])
    add(g_close())


def escena_openapi():
    add(g(C["indigo"]))
    # Contrato
    rrect(320, 60, 150, 130, 12)
    add(f'<rect x="320" y="60" width="150" height="130" rx="12" fill="{C["indigo"]}" fill-opacity="0.06"/>')
    path("M 348 92 L 336 104 L 336 116 L 328 124 L 336 132 L 336 144 L 348 156")
    path("M 372 92 L 384 104 L 384 116 L 392 124 L 384 132 L 384 144 L 372 156")
    line(342, 124, 356, 124)
    # Título del contrato
    line(410, 84, 454, 84)
    line(410, 100, 444, 100)
    for yy in (120, 138, 156):
        line(410, yy, 452, yy)
    # Llave JWT
    circle(500, 108, 14)
    line(510, 118, 538, 146)
    line(530, 154, 538, 146)
    line(524, 140, 532, 132)
    circle(504, 108, 4)
    add(g_close())


SCENES = {
    "erp": escena_erp,
    "admin": escena_admin,
    "api": escena_api,
    "storybook": escena_storybook,
    "assistant": escena_assistant,
    "delegation": escena_delegation,
    "titula": escena_titula,
    "billing": escena_billing,
    "presentation": escena_presentation,
    "api-docs": escena_api_docs,
    "openapi": escena_openapi,
}

COLORS = {
    "erp": REACT, "admin": CLERK, "api": POSTGRES,
    "storybook": STORYBOOK, "assistant": C["gold"],
    "delegation": C["teal"], "titula": C["teal"],
    "billing": C["indigo"], "presentation": C["indigo"],
    "api-docs": C["indigo"], "openapi": C["indigo"],
}


def g_close():
    return "</g>"


def render(name):
    global S
    S = []
    color = COLORS[name]
    parts = list(svg_open(color))
    S = []
    escenas = SCENES[name]
    # Cada escena escribe en S mediante helpers globales
    add(*parts)
    body_start = len(S)
    SCENES[name]()
    # Acento inti: una chispa dorada por composición, salvo en gold (ahí es teal)
    accent = GOLD if color != GOLD else C["teal"]
    S.insert(body_start, f'<g fill="none" stroke="{color}" stroke-width="3" '
                         f'stroke-linecap="round" stroke-linejoin="round">')
    S.append("</g>")
    # chispa independiente
    spark_x, spark_y = {
        "erp": (640, 70), "admin": (262, 78), "api": (584, 74), "storybook": (636, 84),
        "assistant": (466, 76), "delegation": (556, 84), "titula": (546, 76),
        "billing": (604, 78), "presentation": (588, 74), "api-docs": (612, 78),
        "openapi": (588, 74),
    }[name]
    S.append(spark(spark_x, spark_y, 8, color=accent, opacity=0.85))
    S.append("</svg>")
    return "\n".join(S)


if __name__ == "__main__":
    import os
    out = os.path.join(os.path.dirname(__file__), "..", "data", "assets", "covers")
    os.makedirs(out, exist_ok=True)
    for name in SCENES:
        with open(os.path.join(out, f"{name}.svg"), "w") as fh:
            fh.write(render(name) + "\n")
        print(f"generado {name}.svg")
