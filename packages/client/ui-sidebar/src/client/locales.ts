/** `sidebar` namespace dictionaries for shell controls and global panels. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'panels.unpinTooltip': '从左侧栏取消固定',
  'panels.unpin': '从侧边栏取消固定{name}',
  'session.new': '新建对话',
  'session.new.label': '新建会话',
  'toggle.open': '打开侧边栏',
  'toggle.collapse': '收起侧边栏',
  'panels.label': '全局面板',
  'conversation.label': '对话',
  'navigation.label': '导航',
  'panels.more': '更多功能',
  'panels.all': '全部功能',
  'panels.close': '关闭',
  'panels.history': '全部对话',
  'panels.settings': '设置与偏好',
  'panels.unavailable': '此功能暂不可用，请关闭其他弹窗后重试。',
  'version.copied': '版本号复制成功',
} satisfies Record<string, string>

/** The sidebar namespace key union. */
export type SidebarKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'panels.unpinTooltip': 'Unpin from left sidebar',
  'panels.unpin': 'Unpin {name} from sidebar',
  'session.new': 'New chat',
  'session.new.label': 'New session',
  'toggle.open': 'Open sidebar',
  'toggle.collapse': 'Collapse sidebar',
  'panels.label': 'Global panels',
  'conversation.label': 'Conversation',
  'navigation.label': 'Navigation',
  'panels.more': 'More features',
  'panels.all': 'All features',
  'panels.close': 'Close',
  'panels.history': 'All conversations',
  'panels.settings': 'Settings and preferences',
  'panels.unavailable': 'This feature is unavailable. Close other dialogs and try again.',
  'version.copied': 'Version copied',
} satisfies Record<SidebarKey, string>

/** Japanese copy, checked against the English keys. */
export const ja = {
  'panels.unpinTooltip': '左サイドバーから固定解除',
  'panels.unpin': '{name}をサイドバーから固定解除',
  'session.new': '新規セッション',
  'session.new.label': '新規セッション',
  'toggle.open': 'サイドバーを開く',
  'toggle.collapse': 'サイドバーを折りたたむ',
  'panels.label': 'グローバルパネル',
  'conversation.label': '会話',
  'navigation.label': 'ナビゲーション',
  'panels.more': 'その他',
  'panels.all': 'すべての機能',
  'panels.close': '閉じる',
  'panels.history': 'すべての会話',
  'panels.settings': '設定',
  'panels.unavailable': 'この機能は現在利用できません。',
  'version.copied': 'バージョンをコピーしました',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'panels.unpinTooltip': 'Desanclar de la barra lateral izquierda',
  'panels.unpin': 'Desfijar {name} de la barra lateral',
  'session.new': 'Nueva sesión',
  'session.new.label': 'Nueva sesión',
  'toggle.open': 'Abrir barra lateral',
  'toggle.collapse': 'Contraer barra lateral',
  'panels.label': 'Paneles globales',
  'conversation.label': 'Conversación',
  'navigation.label': 'Navegación',
  'panels.more': 'Más',
  'panels.all': 'Todas las funciones',
  'panels.close': 'Cerrar',
  'panels.history': 'Todas las conversaciones',
  'panels.settings': 'Configuración',
  'panels.unavailable': 'Esta función no está disponible.',
  'version.copied': 'Versión copiada',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'panels.unpinTooltip': "Retirer l'épingle de la barre latérale gauche",
  'panels.unpin': 'Désépingler {name} de la barre latérale',
  'session.new': 'Nouvelle séance',
  'session.new.label': 'Nouvelle séance',
  'toggle.open': 'Ouvrir la barre latérale',
  'toggle.collapse': 'Réduire la barre latérale',
  'panels.label': 'Panneaux globaux',
  'conversation.label': 'Conversation',
  'navigation.label': 'Navigation',
  'panels.more': 'Plus',
  'panels.all': 'Toutes les fonctionnalités',
  'panels.close': 'Fermer',
  'panels.history': 'Toutes les conversations',
  'panels.settings': 'Paramètres',
  'panels.unavailable': 'Cette fonction est indisponible.',
  'version.copied': 'Version copiée',
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'panels.unpinTooltip': 'Von der linken Seitenleiste lösen',
  'panels.unpin': '{name} von der Seitenleiste lösen',
  'session.new': 'Neue Sitzung',
  'session.new.label': 'Neue Sitzung',
  'toggle.open': 'Seitenleiste öffnen',
  'toggle.collapse': 'Seitenleiste einklappen',
  'panels.label': 'Globale Bereiche',
  'conversation.label': 'Unterhaltung',
  'navigation.label': 'Navigation',
  'panels.more': 'Mehr',
  'panels.all': 'Alle Funktionen',
  'panels.close': 'Schließen',
  'panels.history': 'Alle Unterhaltungen',
  'panels.settings': 'Einstellungen',
  'panels.unavailable': 'Diese Funktion ist nicht verfügbar.',
  'version.copied': 'Version kopiert',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'panels.unpinTooltip': 'Открепить от левой боковой панели',
  'panels.unpin': 'Открепить {name} от боковой панели',
  'session.new': 'Новая сессия',
  'session.new.label': 'Новая сессия',
  'toggle.open': 'Открыть боковую панель',
  'toggle.collapse': 'Свернуть боковую панель',
  'panels.label': 'Глобальные панели',
  'conversation.label': 'Диалог',
  'navigation.label': 'Навигация',
  'panels.more': 'Ещё',
  'panels.all': 'Все функции',
  'panels.close': 'Закрыть',
  'panels.history': 'Все разговоры',
  'panels.settings': 'Настройки',
  'panels.unavailable': 'Эта функция недоступна.',
  'version.copied': 'Версия скопирована',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'panels.unpinTooltip': 'Soltar da barra lateral esquerda',
  'panels.unpin': 'Desafixar {name} da barra lateral',
  'session.new': 'Nova sessão',
  'session.new.label': 'Nova sessão',
  'toggle.open': 'Abrir barra lateral',
  'toggle.collapse': 'Recolher barra lateral',
  'panels.label': 'Painéis globais',
  'conversation.label': 'Conversa',
  'navigation.label': 'Navegação',
  'panels.more': 'Mais',
  'panels.all': 'Todos os recursos',
  'panels.close': 'Fechar',
  'panels.history': 'Todas as conversas',
  'panels.settings': 'Configurações',
  'panels.unavailable': 'Este recurso está indisponível.',
  'version.copied': 'Versão copiada',
} satisfies Record<keyof typeof en, string>
