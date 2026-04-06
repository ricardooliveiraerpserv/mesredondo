# Finclaro — Estrutura do Projeto Refatorada

## 📁 Estrutura de Pastas

```
finclaro/
├── index.html              ← HTML principal (sem CSS/JS inline)
├── sw.js                   ← Service Worker (arquivo seu, manter como está)
├── css/
│   └── main.css            ← Todo o CSS extraído do <style> original
└── js/
    ├── pwa-bootstrap.js    ← PWA: geração de ícones e manifest
    ├── state.js            ← Estado global, localStorage com namespace
    ├── backup.js           ← Backup/restore + diagnóstico + template Excel
    ├── saldo-banco.js      ← Saldo em banco e contas
    ├── navigation.js       ← Mês/meses, tabs, scroll dinâmico
    ├── lancamentos-modal.js ← Recorrência, modal de lançamentos, máscara BRL
    ├── categorias.js       ← Modal de provisão + módulo de categorias
    ├── render.js           ← Renderização principal (dashboard, tabelas, cards)
    ├── pagamentos-export.js ← Tipos de pagamento, sugestões, exportar Excel
    ├── terceiros.js        ← Aba Terceiros + bulk inline
    ├── vencimentos.js      ← Aba Vencimentos, agendamento, parcelados modal
    ├── parcelados.js       ← Aba Parcelados
    ├── bancos.js           ← Módulo de Bancos
    ├── cartoes-config.js   ← Aba Cartões + Config
    ├── fsel.js             ← FSEL: searchable multi-select reutilizável
    ├── sync-auth.js        ← Sincronização Supabase + autenticação
    ├── deploy.js           ← Deploy GitHub Pages
    ├── auto-update.js      ← Auto-updater via version.json
    └── debug.js            ← Painel de debug
```

## 🔄 O que mudou

### Antes (arquivo único `index.html` com ~15.800 linhas)
- CSS inline num `<style>` gigante (1.800 linhas)
- Múltiplos blocos `<script>` misturados no HTML
- Impossível navegar, versionar ou manter em equipe

### Depois (estrutura modular)
| Arquivo | Responsabilidade | Linhas aprox. |
|---------|-----------------|---------------|
| `index.html` | Estrutura HTML pura, imports | ~130 |
| `css/main.css` | Todo o visual | ~1.800 |
| `js/state.js` | Estado e localStorage | ~160 |
| `js/render.js` | Renderização UI | ~3.400 |
| `js/sync-auth.js` | Autenticação + Supabase | ~1.800 |
| `js/backup.js` | Backup + template Excel | ~400 |
| Demais módulos | Funcionalidades específicas | variável |

## 🚀 Como usar

1. **Copie todos os arquivos** mantendo a estrutura de pastas.
2. **Mantenha seu `sw.js`** na raiz (não foi alterado).
3. Sirva com qualquer servidor HTTP estático (GitHub Pages, Netlify, etc).

## ⚙️ Próximos passos sugeridos

### Modularização mais profunda (opcional)
Se quiser ir além, os arquivos maiores ainda podem ser quebrados:

- **`render.js`** (~3.400 linhas) → `render-dashboard.js`, `render-lancamentos.js`, `render-charts.js`
- **`sync-auth.js`** (~1.800 linhas) → `auth.js`, `sync.js`, `admin.js`
- **`backup.js`** → `backup.js`, `import-xlsx.js`, `diagnostico.js`

### CSS modular (opcional)
```
css/
├── variables.css    ← Apenas as :root custom properties
├── layout.css       ← Header, sidebar, main
├── cards.css        ← Sistema de cards
├── tables.css       ← Tabelas e scroll
├── modals.css       ← Modais
└── responsive.css   ← Media queries / mobile
```

### Migração para ES Modules (futura)
Cada arquivo pode se tornar um módulo ES6 com `export`/`import`, eliminando dependências na ordem de carregamento dos scripts.

## 📝 Notas

- A **lógica e funcionalidade são 100% preservadas** — nenhuma linha de código foi alterada, apenas reorganizada em arquivos separados.
- A **ordem de carregamento dos scripts** em `index.html` é importante e reflete as dependências entre módulos.
- O arquivo `sw.js` (Service Worker) não foi incluído — mantenha o seu original.
