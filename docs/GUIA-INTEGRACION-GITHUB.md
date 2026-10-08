# Guía de integración con GitHub (Claude Code)

Esta guía documenta cómo se conectó este repositorio con **Claude Code** a través de GitHub Actions: qué pasos se ejecutaron, qué archivos se crearon, cómo usarlo en el día a día y cómo resolver problemas.

---

## Tabla de contenidos

- [Guía de integración con GitHub (Claude Code)](#guía-de-integración-con-github-claude-code)
  - [Tabla de contenidos](#tabla-de-contenidos)
  - [1. Resumen](#1-resumen)
  - [2. Requisitos previos](#2-requisitos-previos)
  - [3. Pasos ejecutados](#3-pasos-ejecutados)
  - [4. Archivos creados](#4-archivos-creados)
    - [4.1 `claude.yml` — asistente con `@claude`](#41-claudeyml--asistente-con-claude)
    - [4.2 `claude-code-review.yml` — revisión automática de PRs](#42-claude-code-reviewyml--revisión-automática-de-prs)
    - [4.3 `claude-issue-triage.yml` — triaje y diagnóstico de issues](#43-claude-issue-triageyml--triaje-y-diagnóstico-de-issues)
  - [5. Cómo usarlo](#5-cómo-usarlo)
  - [6. Seguridad](#6-seguridad)
  - [7. Personalización](#7-personalización)
  - [8. Comandos de verificación](#8-comandos-de-verificación)
  - [9. Solución de problemas](#9-solución-de-problemas)
  - [10. Referencias](#10-referencias)

---

## 1. Resumen

Tras la integración, el repositorio [`lepo1989/claude-tetris`](https://github.com/lepo1989/claude-tetris) cuenta con dos automatizaciones basadas en [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action):

| Workflow                 | Archivo                                   | Qué hace                                                                                 |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Claude Code**          | `.github/workflows/claude.yml`            | Responde cuando alguien menciona `@claude` en un issue, un PR o una revisión.            |
| **Claude Code Review**   | `.github/workflows/claude-code-review.yml` | Revisa automáticamente cada Pull Request y deja comentarios en línea sobre el código.   |
| **Claude Issue Triage**  | `.github/workflows/claude-issue-triage.yml` | Al crear o editar un issue, le asigna labels y publica un diagnóstico técnico.        |

La autenticación usa la **suscripción de Claude** mediante un token OAuth guardado como secreto del repositorio (`CLAUDE_CODE_OAUTH_TOKEN`), no una API key.

---

## 2. Requisitos previos

- El repositorio publicado en GitHub con un remoto configurado:
  ```bash
  git remote -v
  # origin  https://github.com/lepo1989/claude-tetris.git
  ```
- Permisos de **administrador** sobre el repositorio (necesarios para instalar apps y crear secretos).
- [GitHub CLI (`gh`)](https://cli.github.com/) instalado y autenticado (`gh auth login`).
- Claude Code instalado y una cuenta de Claude con suscripción activa.

---

## 3. Pasos ejecutados

Todo el proceso se lanzó desde Claude Code con un único comando:

```text
/install-github-app
```

El asistente realizó (y pidió confirmar) los siguientes pasos:

1. **Detección del repositorio** — tomó el remoto `origin` → `lepo1989/claude-tetris`.
2. **Instalación de la GitHub App de Claude** — abrió el navegador en la página de instalación de la app y se le concedió acceso a este repositorio.
3. **Selección de workflows** — se eligieron los dos disponibles:
   - _Claude PR Assistant_ (`@claude`)
   - _Claude Code Review_ (revisión automática)
4. **Autenticación** — se generó un token OAuth de larga duración ligado a la suscripción de Claude y se guardó como secreto del repositorio:
   - Nombre: `CLAUDE_CODE_OAUTH_TOKEN`
   - Creado: 2026-10-08 04:07 UTC
5. **Rama y Pull Request** — se creó la rama `add-claude-github-actions-1791432420107` con dos commits:
   - `5f17725` — "Claude PR Assistant workflow" (`claude.yml`)
   - `d192e96` — "Claude Code Review workflow" (`claude-code-review.yml`)

   y se abrió el **[PR #1 — Add Claude Code GitHub Workflow](https://github.com/lepo1989/claude-tetris/pull/1)**.
6. **Merge** — el PR #1 se fusionó en `main` el 2026-10-08 04:08 UTC (commit de merge `c3f860a`).
   > Los workflows **no se activan hasta que están en la rama por defecto**, por eso este paso es obligatorio.
7. **Sincronización local** — se actualizó el `main` local:
   ```bash
   git pull origin main
   ```

Historial resultante:

```
c3f860a Merge pull request #1 from lepo1989/add-claude-github-actions-1791432420107
d192e96 "Claude Code Review workflow"
5f17725 "Claude PR Assistant workflow"
0ca1b79 First commit
```

---

## 4. Archivos creados

```
.github/
└── workflows/
    ├── claude.yml                # Asistente @claude
    ├── claude-code-review.yml    # Revisión automática de PRs
    └── claude-issue-triage.yml   # Triaje y diagnóstico de issues
```

### 4.1 `claude.yml` — asistente con `@claude`

**Cuándo se ejecuta:** con cualquiera de estos eventos, **siempre que el texto contenga `@claude`**:

| Evento                         | Ejemplo                                              |
| ------------------------------ | ---------------------------------------------------- |
| `issue_comment` (created)      | Comentario en un issue o en la conversación de un PR |
| `pull_request_review_comment`  | Comentario en una línea del diff de un PR            |
| `pull_request_review`          | Envío de una revisión de PR                          |
| `issues` (opened / assigned)   | `@claude` en el título o cuerpo de un issue nuevo    |

El filtro está en la condición `if` del job:

```yaml
if: |
  (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
  (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
  (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
  (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
```

**Permisos del job:**

```yaml
permissions:
  contents: read
  pull-requests: read
  issues: read
  id-token: write   # para obtener el token de la GitHub App vía OIDC
  actions: read     # para que Claude pueda leer resultados de CI en PRs
```

> Los permisos del `GITHUB_TOKEN` son de solo lectura. Las escrituras (comentarios, ramas, commits) las hace la **GitHub App de Claude** con su propio token.

**Paso principal:**

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    additional_permissions: |
      actions: read
```

Sin `prompt`, Claude ejecuta lo que se le pida en el comentario que lo mencionó.

### 4.2 `claude-code-review.yml` — revisión automática de PRs

**Cuándo se ejecuta:** en cada Pull Request `opened`, `synchronize` (nuevo push), `ready_for_review` o `reopened`. No necesita `@claude`.

**Paso principal:**

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    plugin_marketplaces: 'https://github.com/anthropics/claude-code.git'
    plugins: 'code-review@claude-code-plugins'
    prompt: '/code-review:code-review --comment ${{ github.repository }}/pull/${{ github.event.pull_request.number }}'
    claude_args: '--allowedTools "mcp__github_inline_comment__create_inline_comment"'
```

| Input                 | Propósito                                                                     |
| --------------------- | ----------------------------------------------------------------------------- |
| `plugin_marketplaces` | Marketplace de plugins oficial de Claude Code.                                |
| `plugins`             | Instala el plugin `code-review`.                                              |
| `prompt`              | Ejecuta `/code-review:code-review --comment` sobre el PR actual.              |
| `claude_args`         | Limita las herramientas a la creación de comentarios en línea sobre el diff. |

### 4.3 `claude-issue-triage.yml` — triaje y diagnóstico de issues

Añadido después de la instalación inicial. Su objetivo es que cada issue llegue clasificado y con un análisis técnico listo para implementar.

**Cuándo se ejecuta:** `issues` con `opened` o `edited` (cambio de título o descripción). No necesita `@claude`.

- Cambiar labels genera el evento `labeled`, no `edited`, así que el propio triaje no se re-dispara.
- `if: github.event.sender.type != 'Bot'` ignora ediciones hechas por bots.
- `concurrency` por número de issue: si se edita varias veces seguidas, solo se completa el último análisis.

**Permisos:** `contents: read`, `issues: write` (labels y comentarios con el `GITHUB_TOKEN`), `id-token: write`.

**Herramientas permitidas** (solo lectura de código + `gh` para el issue):

```yaml
claude_args: '--allowedTools "Bash(gh issue view:*),Bash(gh issue edit:*),Bash(gh label list:*),Bash(gh api:*),Read,Glob,Grep"'
```

Claude no puede modificar archivos ni crear ramas en este workflow.

**Labels que asigna** (solo usa labels existentes):

| Grupo     | Labels                                                                 | Cuántas        |
| --------- | ---------------------------------------------------------------------- | -------------- |
| Tipo      | `bug`, `enhancement`, `documentation`, `question`                      | exactamente 1  |
| Prioridad | `prioridad: alta`, `prioridad: media`, `prioridad: baja`               | exactamente 1  |
| Área      | `área: gameplay`, `área: ui`, `área: rendering`, `área: ci`            | 1 o más        |
| Extra     | `question` (falta información), `good first issue`, `duplicate`        | opcional       |

Las labels de prioridad y área se crearon una vez con `gh label create`. Al re-analizar un issue editado, Claude quita las labels de esos grupos que ya no apliquen y no toca las demás.

**Diagnóstico:** un único comentario que empieza con el marcador `<!-- claude-triage -->`. Si el issue se edita, Claude **actualiza ese mismo comentario** en lugar de crear otro. Estructura:

1. Resumen
2. Clasificación (tipo · prioridad · área, justificadas)
3. Análisis técnico (archivos y funciones con `archivo:línea`, causa probable o punto de extensión)
4. Propuesta de solución paso a paso
5. Criterios de aceptación (checklist)
6. Riesgos y dudas
7. Complejidad estimada

**De diagnóstico a código:** cuando el diagnóstico esté bien, comenta en el issue:

```text
@claude implementa la solución propuesta en el diagnóstico
```

El workflow `claude.yml` toma el relevo, crea una rama con los cambios y deja el enlace para abrir el PR, que a su vez pasa por la revisión automática.

---

## 5. Cómo usarlo

**Pedir algo en un issue:**

```text
Título: @claude añade un contador de tiempo de partida al HUD
Cuerpo: Mostrar mm:ss junto a SCORE/LINES/LEVEL y reiniciarlo en init().
```

Claude responderá en el issue y, si corresponde, creará una rama con los cambios y un enlace para abrir el PR.

**Pedir algo en un PR:**

```text
@claude ¿este cambio rompe la detección de game over en spawn()?
@claude corrige el error de tipografía que señalé en game.js
```

**Revisión automática:** basta con abrir un PR (o hacer push a uno abierto). La revisión aparece como comentarios en línea en la pestaña _Files changed_.

**Ver las ejecuciones:** pestaña **Actions** del repositorio, o desde la terminal:

```bash
gh run list
gh run view <run-id> --log
```

---

## 6. Seguridad

- El token OAuth vive **solo** como secreto cifrado de GitHub Actions; no aparece en el código ni en los logs.
- Solo usuarios con **acceso de escritura** al repositorio pueden disparar el workflow con `@claude`.
- Todas las ejecuciones quedan registradas en el historial de **Actions**.
- Por defecto Claude solo puede leer/escribir archivos e interactuar con el repo (comentarios, ramas, commits). Para habilitar más herramientas se usa `claude_args`, por ejemplo:
  ```yaml
  claude_args: '--allowedTools "Bash(python3 -m http.server*)"'
  ```
- Para revocar el acceso: elimina el secreto (`gh secret delete CLAUDE_CODE_OAUTH_TOKEN`) y/o desinstala la app en _Settings → Integrations → GitHub Apps_.

---

## 7. Personalización

| Qué quieres                               | Dónde                    | Cómo                                                                       |
| ----------------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| Revisar solo ciertos archivos             | `claude-code-review.yml` | Descomenta `paths:` bajo `pull_request` (p. ej. `"**/*.js"`, `"**/*.css"`). |
| Revisar solo PRs de ciertos autores       | `claude-code-review.yml` | Descomenta el `if:` del job con `github.event.pull_request.user.login`.    |
| Una instrucción fija para `@claude`       | `claude.yml`             | Descomenta `prompt:`.                                                      |
| Más herramientas / opciones de la CLI     | ambos                    | `claude_args:` (ver [referencia de la CLI](https://code.claude.com/docs/en/cli-reference)). |
| Dar contexto del proyecto a Claude en CI  | raíz del repo            | Versiona `CLAUDE.md`: la acción lo lee igual que Claude Code en local.      |

> En este proyecto `CLAUDE.md` existe localmente pero aún **no está commiteado**. Súbelo para que Claude en GitHub conozca las convenciones del juego (cell value = tipo de pieza, `collide()` como única fuente de verdad, etc.).

---

## 8. Comandos de verificación

```bash
ls .github/workflows             # claude.yml  claude-code-review.yml  claude-issue-triage.yml
gh label list                    # incluye prioridad: * y área: *
gh secret list                   # CLAUDE_CODE_OAUTH_TOKEN
gh pr view 1                     # PR de instalación (MERGED)
gh workflow list                 # Claude Code / Claude Code Review (active)
gh run list --limit 5            # Últimas ejecuciones
```

Prueba de humo: crea un issue con `@claude hola, resume qué hace game.js` y comprueba que aparece una ejecución en `gh run list` y una respuesta en el issue.

---

## 9. Solución de problemas

| Síntoma                                         | Causa probable                                             | Solución                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `@claude` no hace nada                          | El workflow no está en `main` o falta `@claude` en el texto | Verifica que el PR #1 está mergeado y que el comentario incluye `@claude`.                     |
| El workflow no se dispara por un usuario        | El usuario no tiene permisos de escritura                  | Dale acceso de escritura o pide a un colaborador que lo invoque.                               |
| Error de autenticación en el log                | Token expirado o revocado                                   | Genera uno nuevo con `claude setup-token` y actualízalo: `gh secret set CLAUDE_CODE_OAUTH_TOKEN`, o re-ejecuta `/install-github-app`. |
| Claude no puede comentar ni crear ramas         | La GitHub App no tiene acceso al repo                      | _Settings → Integrations → GitHub Apps → Claude → Configure_ y añade el repositorio.           |
| La revisión automática no aparece en un PR      | PR desde un fork (los secretos no se exponen a forks)      | Abre el PR desde una rama del propio repositorio.                                              |

---

## 10. Referencias

- [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action)
- [Guía de uso de la acción](https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md)
- [Referencia de la CLI de Claude Code](https://code.claude.com/docs/en/cli-reference)
- [PR #1 — Add Claude Code GitHub Workflow](https://github.com/lepo1989/claude-tetris/pull/1)
