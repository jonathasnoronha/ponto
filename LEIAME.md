# Ponto

Cartão de ponto para celular (app web instalável): registra entradas e saídas, calcula horas trabalhadas, extras 50%/100%, débitos e saldo por semana e por mês.

- `index.html`: telas (login e app)
- `app.js`: cálculo das horas e interface
- `firebase.js`: login por e-mail/senha, banco Firestore e modo administrador
- `config.js`: chaves do projeto Firebase
- `firestore.rules`: regras de segurança do banco (cole em Firestore → Regras)
- `sw.js` e `manifest.webmanifest`: instalação na tela inicial e abertura offline

Cada conta só vê os próprios registros. O e-mail listado em `firestore.rules` (com e-mail confirmado) vê e corrige os registros de todas as contas, pela aba Ajustes.
