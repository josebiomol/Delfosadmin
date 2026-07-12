// Cópia da lista de módulos do app cliente (menuModules.js). Se adicionar
// um módulo novo lá, replique aqui também — são dois projetos separados.
export const MODULOS = [
  { grupo: 'Gestão Estratégica', itens: [
    { key: 'gestao_estrategica', label: 'Gestão Estratégica (BSC/Backlog/Sprints)' },
  ] },
  { grupo: 'Qualidade', itens: [
    { key: 'gestao_documentos', label: 'Gestão de documentos' },
    { key: 'gestao_processos', label: 'Gestão de processos' },
    { key: 'gestao_riscos', label: 'Gestão de riscos' },
    { key: 'gestao_ocorrencias', label: 'Gestão de ocorrências' },
    { key: 'gestao_planos_acoes', label: 'Gestão de planos de ações' },
    { key: 'gestao_indicadores', label: 'Gestão de indicadores' },
    { key: 'gestao_auditorias', label: 'Gestão de auditorias' },
  ] },
  { grupo: 'Pessoas', itens: [
    { key: 'gestao_treinamentos', label: 'Gestão de treinamentos' },
    { key: 'gestao_acidentes', label: 'Gestão de acidentes' },
    { key: 'recursos_humanos', label: 'Recursos humanos' },
  ] },
  { grupo: 'Operação', itens: [
    { key: 'agendamento', label: 'Agendamento' },
    { key: 'gestao_atendimento_cliente', label: 'Gestão de atendimento ao cliente' },
    { key: 'gestao_reunioes', label: 'Gestão de reuniões' },
    { key: 'gestao_ordem_servico', label: 'Gestão de ordem de serviço' },
    { key: 'gestao_patrimonio', label: 'Gestão do patrimônio' },
    { key: 'controle_agua', label: 'Controle de qualidade da água' },
    { key: 'gestao_temp_umidade', label: 'Controle de temperatura e umidade' },
    { key: 'faturamento', label: 'Faturamento' },
    { key: 'tarefas', label: 'Tarefas e Comunicados' },
  ] },
  { grupo: 'Fornecedores e estratégia', itens: [
    { key: 'gestao_fornecedores_produtos', label: 'Gestão de fornecedores de produtos' },
    { key: 'gestao_fornecedores_servicos', label: 'Gestão de fornecedores de serviços' },
    { key: 'modelo_canvas', label: 'Modelo de negócio canvas' },
    { key: 'cadeia_valor', label: 'Cadeia de valor' },
    { key: 'gestao_mudanca_inovacao', label: 'Gestão de mudança e inovação' },
  ] },
  { grupo: 'Sistema', itens: [
    { key: 'configuracoes', label: 'Configurações (usuários, permissões, etc.)' },
  ] },
];