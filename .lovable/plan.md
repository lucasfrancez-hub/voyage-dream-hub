# Trusted Devices + MFA Obrigatório — VIA AIR Admin

Dois reforços no login admin trabalhando juntos:
1. **MFA (TOTP) obrigatório** pra todo usuário — sem exceção.
2. **Dispositivos confiáveis** — device confiável pula só o passo do TOTP (senha continua obrigatória).

## Fluxos

**Primeiro login de um usuário (ainda sem MFA cadastrado):**
1. E-mail + senha
2. Tela **obrigatória** de "Ative seu autenticador": QR code + campo pra digitar código
3. Não consegue prosseguir sem ativar
4. Após ativar, entra normalmente + opção "confiar neste dispositivo"

**Login normal (MFA já ativo, device novo):**
1. E-mail + senha
2. TOTP obrigatório
3. Checkbox "confiar neste dispositivo por 30 dias" (opcional) → e-mail de aviso

**Login em device confiável (dentro de 30 dias):**
1. E-mail + senha
2. Entra direto

**Painel `/admin/seguranca`:**
- Aba "Meu MFA": mostra se está ativo, permite reconfigurar
- Aba "Dispositivos confiáveis": lista + revogar individual / todos
- (Admin master) Aba "Usuários": ver quem tem MFA ativo, forçar reset

## Como funciona por baixo

### MFA obrigatório
- Após `signInWithPassword`, checa `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`
- Se `currentLevel === 'aal1'` e usuário **não tem** fator enrollado → força tela de enrollment (não deixa fechar/pular)
- Se tem fator mas `currentLevel === 'aal1'` → exige TOTP (a menos que device confiável)
- Logout automático se tentar fechar a tela

### Trusted devices
- **Tabela `trusted_devices`**: `user_id`, `token_hash` (SHA-256), `user_agent`, `ip_address`, `last_used_at`, `expires_at`. RLS: `auth.uid() = user_id`.
- **Cookie httpOnly** `via_td` (256 bits, base64), `Secure`, `SameSite=Lax`, 30 dias.
- **Server fns**: `checkTrustedDevice`, `registerTrustedDevice`, `revokeTrustedDevice`, `listTrustedDevices`.
- Token nunca em texto puro no banco — só hash SHA-256.
- Cookie httpOnly → imune a XSS.

## Arquivos

- **Migration**: `public.trusted_devices` com GRANTs + RLS.
- **`src/lib/trusted-devices.functions.ts`**: server fns.
- **`src/routes/auth.tsx`**: adiciona (a) checagem de trusted device antes do MFA, (b) tela de enrollment forçado, (c) checkbox "confiar", (d) chamada de `registerTrustedDevice`.
- **`src/components/auth/MfaEnrollGate.tsx`**: novo componente da tela de enrollment obrigatório.
- **`src/routes/admin.seguranca.tsx`**: nova aba "Dispositivos confiáveis" + status do MFA do usuário.
- **Template e-mail**: "novo dispositivo autorizado" (usa infra já configurada).

## Segurança / trade-offs

- ✅ Mesmo com senha vazada + cookie roubado, atacante precisa do TOTP se cookie não estiver na tabela.
- ✅ Revogar device = deleta linha → cookie vira inválido no próximo check.
- ⚠️ Todos os admins precisam ter app autenticador (Google Authenticator, Authy, 1Password, etc.). No primeiro login pós-deploy, cada um vai ter que passar pela tela de enrollment — comunique a equipe antes.
- ⚠️ Se um admin perder o celular com o app autenticador **e** não tiver device confiável ativo, precisa que outro admin master resete o MFA dele pelo painel.

## Ordem de implementação (proponho fazer tudo em sequência)

1. Migration `trusted_devices` + server fns
2. Rework do `/auth`: enrollment forçado + trusted device check + checkbox
3. Painel de segurança com listagem de devices + status MFA
4. Template de e-mail de novo device
5. Testar fluxo completo

Confirma que:
- **A)** MFA obrigatório pra 100% dos usuários (inclusive parceiros/agências externas)? Ou só role `admin`?
- **B)** Duração do trusted device: **30 dias** OK ou prefere outro (7/60/90)?
