#!/usr/bin/env python3
"""
Agente Safeguard (Oba Viagens) — roda no Mac, ao lado do BlueStacks.

O que ele faz, em loop:
  1. Abre o app Safeguard dentro do BlueStacks (via ADB);
  2. Lê a tela do app e acha o código numérico;
  3. Quando o código muda, envia para o portal VIA AIR
     (/api/public/otp-inbox, provider "oba").

Daí qualquer automação do portal chama `aguardarCodigo({ provider: "oba" })`
e recebe o código na hora — sem você tocar no emulador.

PRÉ-REQUISITOS (uma vez só):
  1. BlueStacks 5 instalado e com o Safeguard logado.
  2. No BlueStacks: Preferências > Avançado > ativar "Android Debug Bridge".
  3. Instalar o adb no Mac:
        brew install --cask android-platform-tools
  4. Instalar dependência Python:
        pip3 install requests
  5. Preencher abaixo TOKEN e conferir PACOTE_APP.

USO:
  python3 safeguard_agent.py            # roda em loop (a cada 12s)
  python3 safeguard_agent.py --uma-vez  # lê e envia uma vez só (teste)

Opcional: variáveis de ambiente SAFEGUARD_TOKEN e SAFEGUARD_URL
sobrescrevem os valores abaixo.
"""

import os
import re
import subprocess
import sys
import time

# ============ CONFIGURAÇÃO ============
# URL do portal (pode manter pedidos.viaair.tur.br).
URL_INBOX = os.environ.get(
    "SAFEGUARD_URL", "https://pedidos.viaair.tur.br/api/public/otp-inbox"
)

# Mesmo segredo OTP_INBOX_SECRET configurado no portal.
# Preencha aqui OU exporte SAFEGUARD_TOKEN no terminal.
TOKEN = os.environ.get("SAFEGUARD_TOKEN", "PREENCHA_COM_OTP_INBOX_SECRET")

# Endereço ADB do BlueStacks (padrão do BlueStacks 5 no Mac).
ADB_SERIAL = os.environ.get("SAFEGUARD_ADB", "localhost:5555")

# Pacote do app Safeguard. Descubra o seu com:
#   adb -s localhost:5555 shell pm list packages | grep -i safe
# ou abra o app e rode:
#   adb -s localhost:5555 shell "dumpsys window | grep mCurrentFocus"
PACOTE_APP = os.environ.get("SAFEGUARD_PKG", "PREENCHA_COM_PACOTE_DO_APP")

# Intervalo do loop em segundos (o código do Safeguard troca ~a cada 30s).
INTERVALO = 12

# Tempo esperando o app abrir antes de ler a tela.
ESPERA_ABERTURA = 4
# ======================================


def adb(*args: str, timeout: int = 20) -> str:
    """Roda um comando adb e devolve a saída."""
    r = subprocess.run(
        ["adb", "-s", ADB_SERIAL, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return (r.stdout or "") + (r.stderr or "")


def conectar() -> bool:
    out = adb("get-state", timeout=10)
    if "device" in out:
        return True
    adb("connect", ADB_SERIAL, timeout=10)
    return "device" in adb("get-state", timeout=10)


def abrir_app() -> None:
    adb("shell", "monkey", "-p", PACOTE_APP, "-c",
        "android.intent.category.LAUNCHER", "1")
    time.sleep(ESPERA_ABERTURA)


def ler_codigo_da_tela() -> str | None:
    """Despeja a UI do app e procura um número de 6 dígitos."""
    adb("shell", "uiautomator", "dump", "/sdcard/safeguard.xml")
    xml = adb("shell", "cat", "/sdcard/safeguard.xml")
    # Pega o texto de cada elemento e procura 6 dígitos isolados.
    for texto in re.findall(r'text="([^"]+)"', xml):
        m = re.fullmatch(r"\s*(\d{3})[ .-]?(\d{3})\s*", texto)
        if m:
            return m.group(1) + m.group(2)
    # Plano B: qualquer sequência de 6 dígitos no XML.
    m = re.search(r"\b(\d{6})\b", xml)
    return m.group(1) if m else None


def enviar_codigo(codigo: str) -> bool:
    import requests

    r = requests.post(
        URL_INBOX,
        json={
            "text": f"Safeguard OBA - codigo {codigo}",
            "code": codigo,
            "source": "api",
            "provider": "oba",
            "sender": "bluestacks-mac",
        },
        headers={"x-otp-secret": TOKEN},
        timeout=30,
    )
    return r.ok


def main() -> None:
    if "PREENCHA" in TOKEN or "PREENCHA" in PACOTE_APP:
        print("Configure TOKEN e PACOTE_APP no topo do script antes de rodar.")
        sys.exit(1)

    uma_vez = "--uma-vez" in sys.argv
    ultimo = None
    falhas = 0

    print(f"[safeguard] conectando no BlueStacks ({ADB_SERIAL})...")
    while True:
        try:
            if not conectar():
                raise RuntimeError("BlueStacks não respondeu no ADB")
            abrir_app()
            codigo = ler_codigo_da_tela()
            if codigo and codigo != ultimo:
                if enviar_codigo(codigo):
                    print(f"[safeguard] código {codigo[:2]}**** enviado ao portal")
                    ultimo = codigo
                    falhas = 0
                else:
                    raise RuntimeError("portal recusou o código")
            elif codigo:
                print(f"[safeguard] código inalterado {codigo[:2]}****")
            else:
                print("[safeguard] nenhum código encontrado na tela")
            if uma_vez:
                break
        except Exception as e:  # noqa: BLE001
            falhas += 1
            print(f"[safeguard] erro: {e} (tentativa {falhas})")
            time.sleep(min(60, 10 * falhas))
            if uma_vez:
                sys.exit(1)
        if not uma_vez:
            time.sleep(INTERVALO)


if __name__ == "__main__":
    main()
