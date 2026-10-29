# Checkpoint M31

- Base: `0e031fdfca8e4a9a126a2838ea82775c2802c7e3`, tree `25a24dbab7a67809a90f4392cf2b06eab46017f0`; 903 certificadas/autorizadas e efetivamente online no Bot-Hosting.net.
- CI da base: 40941198166 aprovada. PR12 em rascunho; descrição antiga ainda menciona 890, mas o HEAD/runtime têm 903.
- Automação anterior não publicada foi perdida na manutenção do workspace. Reconstruída, com gerador, worklist, executor de cenários reais, promoção via gate M21, registro delimitado, revisão do catálogo, feedback rápido adicional e deploy com CI/backup/probe/rollback de código.
- O exemplo M30/M31 usa Dian Keto já existente; oito cenários executados no motor público isolado; zero certificações novas. Sete testes de infraestrutura e seis testes de deploy passaram. Não apresentar isso como +1 carta.
- A API da hospedagem existe e foi conferida na documentação. Cliente implementado/testado com respostas simuladas, sem chave fornecida. O painel segue autenticado para implantações reais; não criar credenciais nem substituir banco.
- Validação local: feedback rápido aprovado e 6413/6413 testes da suíte completa, zero falhas/cancelados/ignorados/TODO. Preservar todos os checks atuais. Depois usar imediatamente em lotes reais; meta inicial >1000. Faltam 97 para chegar a 1000 e 98 para ultrapassar, sobre base 903.
- Material de pesquisa recuperado em scratch: agregado YGOJSON e `m31-pending-full.json`, não publicar dados brutos. Lista atual: 523 monstros de efeito, 259 magias, 238 armadilhas, 31 fusões, 5 rituais e 3 normais. Revisar identidades/aliases antes de propor admissão.
