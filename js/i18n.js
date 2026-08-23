// Translations. Adding a language = adding its code to LANGUAGES and a value
// under each key below; anything left untranslated falls back to English
// rather than breaking, so a partial language is a usable one.
(function (SYS) {
  "use strict";

  // Each language's own name in that language — a switcher is the one place
  // you can't rely on the reader understanding the current language.
  SYS.LANGUAGES = {
    en: { name: "English", dir: "ltr" },
    ar: { name: "العربية", dir: "rtl" },
    es: { name: "Español", dir: "ltr" },
    fr: { name: "Français", dir: "ltr" },
    de: { name: "Deutsch", dir: "ltr" },
    ja: { name: "日本語", dir: "ltr" },
    zh: { name: "中文", dir: "ltr" },
  };

  const STRINGS = {
    // ---- navigation & chrome ----
    "nav.overview": { en: "Overview", ar: "نظرة عامة", es: "Resumen", fr: "Aperçu", de: "Übersicht", ja: "概要", zh: "概览" },
    "nav.quests": { en: "Quests", ar: "المهام", es: "Misiones", fr: "Quêtes", de: "Aufgaben", ja: "クエスト", zh: "任务" },
    "nav.habits": { en: "Habits", ar: "العادات", es: "Hábitos", fr: "Habitudes", de: "Gewohnheiten", ja: "習慣", zh: "习惯" },
    "nav.stats": { en: "Stats", ar: "الإحصائيات", es: "Estadísticas", fr: "Statistiques", de: "Statistiken", ja: "統計", zh: "统计" },
    "nav.intelligence": { en: "Intelligence", ar: "الذكاءات", es: "Inteligencias", fr: "Intelligences", de: "Intelligenzen", ja: "知能", zh: "智能" },
    "nav.log": { en: "Log", ar: "السجل", es: "Registro", fr: "Journal", de: "Verlauf", ja: "ログ", zh: "日志" },
    "nav.leaderboard": { en: "Ranking", ar: "الترتيب", es: "Clasificación", fr: "Classement", de: "Rangliste", ja: "ランキング", zh: "排名" },
    "nav.admin": { en: "Admin", ar: "الإدارة", es: "Admin", fr: "Admin", de: "Admin", ja: "管理", zh: "管理" },
    "nav.settings": { en: "Settings", ar: "الإعدادات", es: "Ajustes", fr: "Paramètres", de: "Einstellungen", ja: "設定", zh: "设置" },
    "status.rename": { en: "Click to rename", ar: "اضغط لتغيير الاسم", es: "Clic para renombrar", fr: "Cliquez pour renommer", de: "Zum Umbenennen klicken", ja: "クリックして名前を変更", zh: "点击重命名" },
    "status.rank": { en: "{rank}-RANK", ar: "رتبة {rank}", es: "RANGO {rank}", fr: "RANG {rank}", de: "RANG {rank}", ja: "{rank}ランク", zh: "{rank}级" },
    "status.level": { en: "LV. {n}", ar: "مستوى {n}", es: "NIV. {n}", fr: "NIV. {n}", de: "LV. {n}", ja: "レベル{n}", zh: "等级{n}" },

    // ---- overview ----
    "overview.eyebrow": { en: "PLAYER STATUS", ar: "حالة اللاعب", es: "ESTADO DEL JUGADOR", fr: "STATUT DU JOUEUR", de: "SPIELERSTATUS", ja: "プレイヤーステータス", zh: "玩家状态" },
    "overview.level": { en: "LEVEL", ar: "المستوى", es: "NIVEL", fr: "NIVEAU", de: "LEVEL", ja: "レベル", zh: "等级" },
    "overview.xpOf": { en: "{exp} / {of} xp", ar: "{exp} / {of} نقطة", es: "{exp} / {of} xp", fr: "{exp} / {of} xp", de: "{exp} / {of} XP", ja: "{exp} / {of} XP", zh: "{exp} / {of} 经验" },
    "overview.subtitle": { en: "{rank}-Rank · {n} quests cleared", ar: "رتبة {rank} · {n} مهمة مكتملة", es: "Rango {rank} · {n} misiones completadas", fr: "Rang {rank} · {n} quêtes terminées", de: "Rang {rank} · {n} Aufgaben erledigt", ja: "{rank}ランク · {n}件のクエスト達成", zh: "{rank}级 · 已完成{n}个任务" },
    "overview.activeQuests": { en: "Active quests", ar: "مهام نشطة", es: "Misiones activas", fr: "Quêtes actives", de: "Aktive Aufgaben", ja: "進行中のクエスト", zh: "进行中的任务" },
    "overview.habits": { en: "Habits", ar: "عادات", es: "Hábitos", fr: "Habitudes", de: "Gewohnheiten", ja: "習慣", zh: "习惯" },
    "overview.traitsTracked": { en: "Traits tracked", ar: "صفات متتبَّعة", es: "Rasgos registrados", fr: "Traits suivis", de: "Erfasste Merkmale", ja: "記録中の特性", zh: "已记录特质" },
    "overview.radar": { en: "INTELLIGENCE RADAR", ar: "خريطة الذكاءات", es: "RADAR DE INTELIGENCIAS", fr: "RADAR DES INTELLIGENCES", de: "INTELLIGENZ-RADAR", ja: "知能レーダー", zh: "智能雷达图" },
    "overview.radarAlt": { en: "Intelligence radar chart", ar: "رسم بياني لخريطة الذكاءات", es: "Gráfico radar de inteligencias", fr: "Graphique radar des intelligences", de: "Intelligenz-Radardiagramm", ja: "知能レーダーチャート", zh: "智能雷达图表" },
    "overview.radarNeedsMore": { en: "Add at least 3 categories to see the radar.", ar: "أضف 3 فئات على الأقل لعرض الخريطة.", es: "Añade al menos 3 categorías para ver el radar.", fr: "Ajoutez au moins 3 catégories pour voir le radar.", de: "Füge mindestens 3 Kategorien hinzu, um das Radar zu sehen.", ja: "レーダーを表示するには3つ以上のカテゴリが必要です。", zh: "至少添加3个类别才能显示雷达图。" },
    "overview.recent": { en: "RECENT ACTIVITY", ar: "النشاط الأخير", es: "ACTIVIDAD RECIENTE", fr: "ACTIVITÉ RÉCENTE", de: "LETZTE AKTIVITÄT", ja: "最近の活動", zh: "最近动态" },
    "overview.viewLog": { en: "View full log →", ar: "عرض السجل كاملًا ←", es: "Ver registro completo →", fr: "Voir le journal complet →", de: "Vollständigen Verlauf ansehen →", ja: "ログをすべて見る →", zh: "查看完整日志 →" },
    "overview.noMilestones": { en: "No milestones yet. Clear quests to begin your ascent.", ar: "لا إنجازات بعد. أكمل مهامك لتبدأ صعودك.", es: "Aún no hay logros. Completa misiones para comenzar tu ascenso.", fr: "Aucun jalon pour l'instant. Terminez des quêtes pour commencer votre ascension.", de: "Noch keine Meilensteine. Erledige Aufgaben, um deinen Aufstieg zu beginnen.", ja: "まだ実績がありません。クエストを達成して昇格を始めましょう。", zh: "还没有里程碑。完成任务开始你的进阶之路。" },

    // ---- intelligence ----
    "intel.eyebrow": { en: "INTELLIGENCE", ar: "الذكاءات", es: "INTELIGENCIAS", fr: "INTELLIGENCES", de: "INTELLIGENZEN", ja: "知能", zh: "智能" },
    "intel.title": { en: "Categories & traits", ar: "الفئات والصفات", es: "Categorías y rasgos", fr: "Catégories et traits", de: "Kategorien & Merkmale", ja: "カテゴリと特性", zh: "类别与特质" },
    "intel.lv": { en: "Lv {n}", ar: "مستوى {n}", es: "Niv {n}", fr: "Niv {n}", de: "Lv {n}", ja: "Lv {n}", zh: "等级{n}" },
    "intel.removeTrait": { en: "Remove trait", ar: "حذف الصفة", es: "Eliminar rasgo", fr: "Supprimer le trait", de: "Merkmal entfernen", ja: "特性を削除", zh: "删除特质" },
    "intel.confirmAgain": { en: "Click again to confirm", ar: "اضغط مرة أخرى للتأكيد", es: "Haz clic de nuevo para confirmar", fr: "Cliquez à nouveau pour confirmer", de: "Zum Bestätigen erneut klicken", ja: "もう一度クリックして確認", zh: "再次点击以确认" },
    "intel.addTrait": { en: "+ add trait", ar: "+ إضافة صفة", es: "+ añadir rasgo", fr: "+ ajouter un trait", de: "+ Merkmal hinzufügen", ja: "+ 特性を追加", zh: "+ 添加特质" },
    "intel.traitName": { en: "Trait name", ar: "اسم الصفة", es: "Nombre del rasgo", fr: "Nom du trait", de: "Merkmalsname", ja: "特性名", zh: "特质名称" },
    "intel.arabicOpt": { en: "Arabic (opt.)", ar: "بالعربية (اختياري)", es: "Árabe (opc.)", fr: "Arabe (fac.)", de: "Arabisch (opt.)", ja: "アラビア語（任意）", zh: "阿拉伯语（可选）" },
    "intel.add": { en: "Add", ar: "إضافة", es: "Añadir", fr: "Ajouter", de: "Hinzufügen", ja: "追加", zh: "添加" },
    "intel.remainder": { en: "Banked fractional progress: {pct}% toward next point", ar: "تقدم جزئي محفوظ: {pct}% نحو النقطة التالية", es: "Progreso parcial guardado: {pct}% hacia el siguiente punto", fr: "Progression partielle en réserve : {pct}% vers le point suivant", de: "Gesparter Teilfortschritt: {pct}% bis zum nächsten Punkt", ja: "保留中の部分進捗：次のポイントまで{pct}%", zh: "已储备部分进度：距下一点数{pct}%" },
    "intel.addCategory": { en: "Add category", ar: "إضافة فئة", es: "Añadir categoría", fr: "Ajouter une catégorie", de: "Kategorie hinzufügen", ja: "カテゴリを追加", zh: "添加类别" },
    "intel.newCategory": { en: "New intelligence category", ar: "فئة ذكاء جديدة", es: "Nueva categoría de inteligencia", fr: "Nouvelle catégorie d'intelligence", de: "Neue Intelligenzkategorie", ja: "新しい知能カテゴリ", zh: "新建智能类别" },
    "intel.name": { en: "Name", ar: "الاسم", es: "Nombre", fr: "Nom", de: "Name", ja: "名前", zh: "名称" },
    "intel.namePlaceholder": { en: "e.g. Financial Intelligence", ar: "مثال: الذكاء المالي", es: "p. ej. Inteligencia financiera", fr: "ex. Intelligence financière", de: "z. B. Finanzintelligenz", ja: "例：金融知能", zh: "例：财务智能" },
    "intel.arabicName": { en: "Arabic name (optional)", ar: "الاسم بالعربية (اختياري)", es: "Nombre en árabe (opcional)", fr: "Nom en arabe (facultatif)", de: "Arabischer Name (optional)", ja: "アラビア語名（任意）", zh: "阿拉伯语名称（可选）" },
    "intel.shortCode": { en: "Short code", ar: "رمز مختصر", es: "Código corto", fr: "Code court", de: "Kurzcode", ja: "短縮コード", zh: "简码" },
    "intel.shortPlaceholder": { en: "e.g. FIN", ar: "مثال: مال", es: "p. ej. FIN", fr: "ex. FIN", de: "z. B. FIN", ja: "例：FIN", zh: "例：FIN" },
    "intel.color": { en: "Color", ar: "اللون", es: "Color", fr: "Couleur", de: "Farbe", ja: "色", zh: "颜色" },
    "intel.createCategory": { en: "Create category", ar: "إنشاء الفئة", es: "Crear categoría", fr: "Créer la catégorie", de: "Kategorie erstellen", ja: "カテゴリを作成", zh: "创建类别" },
    "intel.nameRequired": { en: "Name is required.", ar: "الاسم مطلوب.", es: "El nombre es obligatorio.", fr: "Le nom est obligatoire.", de: "Name ist erforderlich.", ja: "名前は必須です。", zh: "名称为必填项。" },

    // ---- quests & habits ----
    "quests.eyebrow": { en: "QUEST LOG", ar: "سجل المهام", es: "REGISTRO DE MISIONES", fr: "JOURNAL DES QUÊTES", de: "AUFGABENPROTOKOLL", ja: "クエストログ", zh: "任务日志" },
    "quests.title": { en: "Your quests", ar: "مهامك", es: "Tus misiones", fr: "Vos quêtes", de: "Deine Aufgaben", ja: "あなたのクエスト", zh: "你的任务" },
    "quests.all": { en: "All", ar: "الكل", es: "Todas", fr: "Toutes", de: "Alle", ja: "すべて", zh: "全部" },
    "quests.active": { en: "Active", ar: "نشطة", es: "Activas", fr: "Actives", de: "Aktiv", ja: "進行中", zh: "进行中" },
    "quests.done": { en: "Done", ar: "مكتملة", es: "Hechas", fr: "Terminées", de: "Erledigt", ja: "完了", zh: "已完成" },
    "quests.new": { en: "New quest", ar: "مهمة جديدة", es: "Nueva misión", fr: "Nouvelle quête", de: "Neue Aufgabe", ja: "新しいクエスト", zh: "新建任务" },
    "quests.empty": { en: "No active quests. The System awaits your next move.", ar: "لا مهام نشطة. النظام بانتظار خطوتك التالية.", es: "No hay misiones activas. El Sistema espera tu próximo movimiento.", fr: "Aucune quête active. Le Système attend votre prochain mouvement.", de: "Keine aktiven Aufgaben. Das System erwartet deinen nächsten Schritt.", ja: "進行中のクエストはありません。システムは次の一手を待っています。", zh: "没有进行中的任务。系统在等待你的下一步。" },
    "quests.emptyFilter": { en: "Nothing in this filter.", ar: "لا شيء ضمن هذا التصنيف.", es: "Nada en este filtro.", fr: "Rien dans ce filtre.", de: "Nichts in diesem Filter.", ja: "この絞り込みに該当なし。", zh: "此筛选条件下没有内容。" },
    "habits.eyebrow": { en: "HABITS", ar: "العادات", es: "HÁBITOS", fr: "HABITUDES", de: "GEWOHNHEITEN", ja: "習慣", zh: "习惯" },
    "habits.title": { en: "Recurring habits", ar: "العادات المتكررة", es: "Hábitos recurrentes", fr: "Habitudes récurrentes", de: "Wiederkehrende Gewohnheiten", ja: "繰り返しの習慣", zh: "重复习惯" },
    "habits.new": { en: "New habit", ar: "عادة جديدة", es: "Nuevo hábito", fr: "Nouvelle habitude", de: "Neue Gewohnheit", ja: "新しい習慣", zh: "新建习惯" },
    "habits.empty": { en: "No recurring habits yet. Something you do every week belongs here, not in Quests.", ar: "لا عادات متكررة بعد. ما تفعله كل أسبوع مكانه هنا، لا في المهام.", es: "Aún no hay hábitos recurrentes. Lo que haces cada semana va aquí, no en Misiones.", fr: "Aucune habitude récurrente. Ce que vous faites chaque semaine va ici, pas dans les Quêtes.", de: "Noch keine wiederkehrenden Gewohnheiten. Was du jede Woche tust, gehört hierher, nicht zu den Aufgaben.", ja: "繰り返しの習慣はまだありません。毎週行うことはクエストではなくここに入ります。", zh: "还没有重复习惯。你每周都做的事属于这里，而不是任务。" },

    // ---- task row ----
    "task.reward": { en: "+{n} xp", ar: "+{n} نقطة", es: "+{n} xp", fr: "+{n} xp", de: "+{n} XP", ja: "+{n} XP", zh: "+{n} 经验" },
    "task.rewardPerRepeat": { en: "+{n} xp/repeat", ar: "+{n} نقطة/مرة", es: "+{n} xp/vez", fr: "+{n} xp/fois", de: "+{n} XP/Mal", ja: "+{n} XP/回", zh: "+{n} 经验/次" },
    "task.edit": { en: "Edit quest", ar: "تعديل المهمة", es: "Editar misión", fr: "Modifier la quête", de: "Aufgabe bearbeiten", ja: "クエストを編集", zh: "编辑任务" },
    "task.delete": { en: "Delete quest", ar: "حذف المهمة", es: "Eliminar misión", fr: "Supprimer la quête", de: "Aufgabe löschen", ja: "クエストを削除", zh: "删除任务" },
    "task.appeal": { en: "Appeal this value", ar: "الاعتراض على هذه القيمة", es: "Apelar este valor", fr: "Contester cette valeur", de: "Diesen Wert anfechten", ja: "この評価に異議を申し立てる", zh: "对此数值提出申诉" },
    "task.priority": { en: "Priority", ar: "الأولوية", es: "Prioridad", fr: "Priorité", de: "Priorität", ja: "優先度", zh: "优先级" },
    "task.term": { en: "Term", ar: "المدة", es: "Plazo", fr: "Durée", de: "Dauer", ja: "期間", zh: "期限" },
    "task.repeats": { en: "Repeats", ar: "التكرار", es: "Repeticiones", fr: "Répétitions", de: "Wiederholungen", ja: "繰り返し", zh: "重复" },
    "task.repeatsPerWeek": { en: "{n}×/week", ar: "{n}× أسبوعيًا", es: "{n}×/semana", fr: "{n}×/semaine", de: "{n}×/Woche", ja: "週{n}回", zh: "每周{n}次" },
    "task.type": { en: "Type", ar: "النوع", es: "Tipo", fr: "Type", de: "Typ", ja: "種類", zh: "类型" },
    "task.recurringHabit": { en: "Recurring habit", ar: "عادة متكررة", es: "Hábito recurrente", fr: "Habitude récurrente", de: "Wiederkehrende Gewohnheit", ja: "繰り返しの習慣", zh: "重复习惯" },
    "task.complete": { en: "Complete quest", ar: "إكمال المهمة", es: "Completar misión", fr: "Terminer la quête", de: "Aufgabe abschließen", ja: "クエストを完了", zh: "完成任务" },
    "task.markIncomplete": { en: "Mark incomplete", ar: "إلغاء الإكمال", es: "Marcar como incompleta", fr: "Marquer comme inachevée", de: "Als unerledigt markieren", ja: "未完了にする", zh: "标记为未完成" },
    "task.decrease": { en: "Decrease 5%", ar: "إنقاص 5%", es: "Reducir 5%", fr: "Diminuer de 5%", de: "Um 5% verringern", ja: "5%減らす", zh: "减少5%" },
    "task.increase": { en: "Increase 5%", ar: "زيادة 5%", es: "Aumentar 5%", fr: "Augmenter de 5%", de: "Um 5% erhöhen", ja: "5%増やす", zh: "增加5%" },
    "task.setPct": { en: "Set completion percentage", ar: "تحديد نسبة الإنجاز", es: "Establecer porcentaje de avance", fr: "Définir le pourcentage d'avancement", de: "Fortschritt in Prozent festlegen", ja: "達成率を設定", zh: "设置完成百分比" },
    "task.weekProgress": { en: "{done} of {total} this week", ar: "{done} من {total} هذا الأسبوع", es: "{done} de {total} esta semana", fr: "{done} sur {total} cette semaine", de: "{done} von {total} diese Woche", ja: "今週 {done}/{total}", zh: "本周 {done}/{total}" },
    "task.amountLogged": { en: " · {amount}{unit} logged", ar: " · تم تسجيل {amount}{unit}", es: " · {amount}{unit} registrado", fr: " · {amount}{unit} enregistré", de: " · {amount}{unit} erfasst", ja: " · {amount}{unit} 記録済み", zh: " · 已记录{amount}{unit}" },
    "task.undoLast": { en: "Undo last log", ar: "تراجع عن آخر تسجيل", es: "Deshacer último registro", fr: "Annuler le dernier enregistrement", de: "Letzten Eintrag rückgängig machen", ja: "最後の記録を取り消す", zh: "撤销上次记录" },
    "task.startTimer": { en: "Start timer", ar: "بدء المؤقت", es: "Iniciar cronómetro", fr: "Démarrer le minuteur", de: "Timer starten", ja: "タイマー開始", zh: "启动计时器" },
    "task.logAmount": { en: "Log {amount}{unit}", ar: "تسجيل {amount}{unit}", es: "Registrar {amount}{unit}", fr: "Enregistrer {amount}{unit}", de: "{amount}{unit} erfassen", ja: "{amount}{unit}を記録", zh: "记录{amount}{unit}" },

    // ---- task form ----
    "form.questTitle": { en: "Quest title", ar: "عنوان المهمة", es: "Título de la misión", fr: "Titre de la quête", de: "Aufgabentitel", ja: "クエスト名", zh: "任务标题" },
    "form.habitName": { en: "Habit name", ar: "اسم العادة", es: "Nombre del hábito", fr: "Nom de l'habitude", de: "Name der Gewohnheit", ja: "習慣名", zh: "习惯名称" },
    "form.questType": { en: "Quest type:", ar: "نوع المهمة:", es: "Tipo de misión:", fr: "Type de quête :", de: "Aufgabentyp:", ja: "クエストの種類：", zh: "任务类型：" },
    "form.oneOff": { en: "One-off", ar: "لمرة واحدة", es: "Única vez", fr: "Ponctuelle", de: "Einmalig", ja: "一回のみ", zh: "一次性" },
    "form.priorityLong": { en: "Priority — how urgent this is", ar: "الأولوية — مدى إلحاحها", es: "Prioridad — qué tan urgente es", fr: "Priorité — degré d'urgence", de: "Priorität — wie dringend ist das", ja: "優先度 — 緊急性", zh: "优先级 — 紧急程度" },
    "form.taskTypeLong": { en: "Task type — how long it runs", ar: "نوع المهمة — مدة استمرارها", es: "Tipo de tarea — cuánto dura", fr: "Type de tâche — sa durée", de: "Aufgabentyp — wie lange sie läuft", ja: "タスクの種類 — 期間", zh: "任务类型 — 持续时长" },
    "form.expMode": { en: "EXP mode:", ar: "طريقة احتساب النقاط:", es: "Modo de XP:", fr: "Mode XP :", de: "XP-Modus:", ja: "XPモード：", zh: "经验模式：" },
    "form.gradual": { en: "Gradual (scales with %)", ar: "تدريجي (حسب النسبة)", es: "Gradual (según el %)", fr: "Progressif (selon le %)", de: "Schrittweise (nach %)", ja: "段階的（％に応じて）", zh: "渐进（按百分比）" },
    "form.allAtOnce": { en: "All at once (100% only)", ar: "دفعة واحدة (عند 100% فقط)", es: "De una vez (solo al 100%)", fr: "D'un coup (100% seulement)", de: "Auf einmal (nur bei 100%)", ja: "一括（100%時のみ）", zh: "一次性（仅100%时）" },
    "form.repeatsPerWeek": { en: "Repeats per week", ar: "مرات التكرار أسبوعيًا", es: "Repeticiones por semana", fr: "Répétitions par semaine", de: "Wiederholungen pro Woche", ja: "週あたりの回数", zh: "每周重复次数" },
    "form.amountPerRepeat": { en: "Amount per repeat", ar: "المقدار لكل مرة", es: "Cantidad por repetición", fr: "Quantité par répétition", de: "Menge pro Wiederholung", ja: "1回あたりの量", zh: "每次的数量" },
    "form.unit": { en: "Unit", ar: "الوحدة", es: "Unidad", fr: "Unité", de: "Einheit", ja: "単位", zh: "单位" },
    "form.customUnit": { en: "Custom unit (e.g. pushups)", ar: "وحدة مخصصة (مثال: تمرين ضغط)", es: "Unidad personalizada (p. ej. flexiones)", fr: "Unité personnalisée (ex. pompes)", de: "Eigene Einheit (z. B. Liegestütze)", ja: "カスタム単位（例：腕立て）", zh: "自定义单位（例：俯卧撑）" },
    "form.other": { en: "Other", ar: "أخرى", es: "Otro", fr: "Autre", de: "Andere", ja: "その他", zh: "其他" },
    "form.custom": { en: "Custom…", ar: "مخصص…", es: "Personalizado…", fr: "Personnalisé…", de: "Benutzerdefiniert…", ja: "カスタム…", zh: "自定义…" },
    "form.describe": { en: "Describe it", ar: "صف المهمة", es: "Descríbelo", fr: "Décrivez-la", de: "Beschreibe sie", ja: "内容を記入", zh: "描述内容" },
    "form.describePlaceholder": { en: "What does this actually involve?", ar: "ما الذي تتضمنه فعليًا؟", es: "¿Qué implica realmente?", fr: "En quoi cela consiste-t-il réellement ?", de: "Was beinhaltet das konkret?", ja: "実際に何をしますか？", zh: "具体包含什么？" },
    "form.notes": { en: "Notes", ar: "ملاحظات", es: "Notas", fr: "Notes", de: "Notizen", ja: "メモ", zh: "备注" },
    "form.notesPlaceholder": { en: "Optional notes...", ar: "ملاحظات اختيارية...", es: "Notas opcionales...", fr: "Notes facultatives...", de: "Optionale Notizen...", ja: "任意のメモ...", zh: "可选备注..." },
    "form.systemSetsValue": { en: "The system reviews this and sets its EXP value — you can't set your own.", ar: "النظام يراجعها ويحدد قيمتها بالنقاط — لا يمكنك تحديدها بنفسك.", es: "El sistema la revisa y fija su valor en XP — no puedes elegirlo tú.", fr: "Le Système l'évalue et fixe sa valeur en XP — vous ne pouvez pas la choisir.", de: "Das System prüft sie und legt ihren XP-Wert fest — du kannst ihn nicht selbst setzen.", ja: "システムが内容を確認しXP値を決定します。自分では設定できません。", zh: "系统会审核并设定其经验值 — 你无法自行设定。" },
    "form.assignedBySystem": { en: "Assigned by the system", ar: "محددة من النظام", es: "Asignado por el sistema", fr: "Attribué par le Système", de: "Vom System zugewiesen", ja: "システムによる設定", zh: "由系统设定" },
    "form.general": { en: "General", ar: "عام", es: "General", fr: "Général", de: "Allgemein", ja: "全般", zh: "综合" },
    "form.accept": { en: "Accept quest", ar: "قبول المهمة", es: "Aceptar misión", fr: "Accepter la quête", de: "Aufgabe annehmen", ja: "クエストを受注", zh: "接受任务" },
    "form.saveChanges": { en: "Save changes", ar: "حفظ التعديلات", es: "Guardar cambios", fr: "Enregistrer", de: "Änderungen speichern", ja: "変更を保存", zh: "保存更改" },
    "form.evaluating": { en: "Evaluating…", ar: "جارٍ التقييم…", es: "Evaluando…", fr: "Évaluation…", de: "Wird bewertet…", ja: "評価中…", zh: "评估中…" },
    "form.cancel": { en: "Cancel", ar: "إلغاء", es: "Cancelar", fr: "Annuler", de: "Abbrechen", ja: "キャンセル", zh: "取消" },
    "form.needsTitle": { en: "Quest needs a title.", ar: "المهمة تحتاج عنوانًا.", es: "La misión necesita un título.", fr: "La quête a besoin d'un titre.", de: "Die Aufgabe braucht einen Titel.", ja: "クエストには名前が必要です。", zh: "任务需要一个标题。" },
    "form.needsDescription": { en: "Describe the task in at least a few words so it can be judged fairly.", ar: "صف المهمة بكلمات قليلة على الأقل ليتم تقييمها بإنصاف.", es: "Describe la tarea con unas pocas palabras para poder evaluarla con justicia.", fr: "Décrivez la tâche en quelques mots pour qu'elle puisse être évaluée équitablement.", de: "Beschreibe die Aufgabe in ein paar Worten, damit sie fair bewertet werden kann.", ja: "公平に評価できるよう、タスクを数語以上で説明してください。", zh: "请用几句话描述任务，以便公平评估。" },
    "form.signInToAdd": { en: "Sign in to add a task — the system has to set its value.", ar: "سجّل الدخول لإضافة مهمة — النظام هو من يحدد قيمتها.", es: "Inicia sesión para añadir una tarea — el sistema debe fijar su valor.", fr: "Connectez-vous pour ajouter une tâche — le Système doit en fixer la valeur.", de: "Melde dich an, um eine Aufgabe hinzuzufügen — das System legt ihren Wert fest.", ja: "タスクを追加するにはサインインが必要です。値はシステムが決定します。", zh: "请登录后添加任务 — 数值由系统设定。" },
    "form.offline": { en: "You're offline. Adding a task needs a connection so the system can evaluate it.", ar: "أنت غير متصل. إضافة مهمة تحتاج اتصالًا ليتمكن النظام من تقييمها.", es: "Estás sin conexión. Añadir una tarea requiere conexión para que el sistema la evalúe.", fr: "Vous êtes hors ligne. Ajouter une tâche nécessite une connexion pour que le Système l'évalue.", de: "Du bist offline. Zum Hinzufügen einer Aufgabe wird eine Verbindung benötigt, damit das System sie bewerten kann.", ja: "オフラインです。タスクの追加にはシステムが評価するための接続が必要です。", zh: "你当前离线。添加任务需要联网以便系统评估。" },
    "priority.Low": { en: "Low", ar: "منخفضة", es: "Baja", fr: "Basse", de: "Niedrig", ja: "低", zh: "低" },
    "priority.Medium": { en: "Medium", ar: "متوسطة", es: "Media", fr: "Moyenne", de: "Mittel", ja: "中", zh: "中" },
    "priority.High": { en: "High", ar: "عالية", es: "Alta", fr: "Haute", de: "Hoch", ja: "高", zh: "高" },
    "term.Short Term": { en: "Short Term", ar: "قصيرة المدى", es: "Corto plazo", fr: "Court terme", de: "Kurzfristig", ja: "短期", zh: "短期" },
    "term.Medium Term": { en: "Medium Term", ar: "متوسطة المدى", es: "Medio plazo", fr: "Moyen terme", de: "Mittelfristig", ja: "中期", zh: "中期" },
    "term.Long Term": { en: "Long Term", ar: "طويلة المدى", es: "Largo plazo", fr: "Long terme", de: "Langfristig", ja: "長期", zh: "长期" },

    // ---- timer ----
    "timer.title": { en: "TIMER", ar: "المؤقت", es: "CRONÓMETRO", fr: "MINUTEUR", de: "TIMER", ja: "タイマー", zh: "计时器" },
    "timer.start": { en: "Start", ar: "بدء", es: "Iniciar", fr: "Démarrer", de: "Start", ja: "開始", zh: "开始" },
    "timer.resume": { en: "Resume", ar: "متابعة", es: "Reanudar", fr: "Reprendre", de: "Fortsetzen", ja: "再開", zh: "继续" },
    "timer.pause": { en: "Pause", ar: "إيقاف مؤقت", es: "Pausar", fr: "Pause", de: "Pause", ja: "一時停止", zh: "暂停" },
    "timer.stopLog": { en: "Stop & log", ar: "إيقاف وتسجيل", es: "Detener y registrar", fr: "Arrêter et enregistrer", de: "Stoppen & erfassen", ja: "停止して記録", zh: "停止并记录" },

    // ---- stats ----
    "stats.eyebrow": { en: "STATISTICS", ar: "الإحصائيات", es: "ESTADÍSTICAS", fr: "STATISTIQUES", de: "STATISTIKEN", ja: "統計", zh: "统计" },
    "stats.title": { en: "Your activity", ar: "نشاطك", es: "Tu actividad", fr: "Votre activité", de: "Deine Aktivität", ja: "あなたの活動", zh: "你的活动" },
    "stats.thisWeek": { en: "THIS WEEK", ar: "هذا الأسبوع", es: "ESTA SEMANA", fr: "CETTE SEMAINE", de: "DIESE WOCHE", ja: "今週", zh: "本周" },
    "stats.thisMonth": { en: "THIS MONTH", ar: "هذا الشهر", es: "ESTE MES", fr: "CE MOIS-CI", de: "DIESEN MONAT", ja: "今月", zh: "本月" },
    "stats.today": { en: "Today · {date}", ar: "اليوم · {date}", es: "Hoy · {date}", fr: "Aujourd'hui · {date}", de: "Heute · {date}", ja: "今日 · {date}", zh: "今天 · {date}" },
    "stats.todayBtn": { en: "Today", ar: "اليوم", es: "Hoy", fr: "Aujourd'hui", de: "Heute", ja: "今日", zh: "今天" },
    "stats.previous": { en: "Previous", ar: "السابق", es: "Anterior", fr: "Précédent", de: "Zurück", ja: "前へ", zh: "上一个" },
    "stats.next": { en: "Next", ar: "التالي", es: "Siguiente", fr: "Suivant", de: "Weiter", ja: "次へ", zh: "下一个" },
    "stats.daysActive": { en: "{active} of {total} days active", ar: "{active} من {total} يوم نشط", es: "{active} de {total} días activo", fr: "{active} jours actifs sur {total}", de: "{active} von {total} Tagen aktiv", ja: "{total}日中{active}日活動", zh: "{total}天中{active}天活跃" },
    "stats.totalXp": { en: "+{n} xp", ar: "+{n} نقطة", es: "+{n} xp", fr: "+{n} xp", de: "+{n} XP", ja: "+{n} XP", zh: "+{n} 经验" },
    "stats.questsCompleted": { en: "Quests completed", ar: "مهام مكتملة", es: "Misiones completadas", fr: "Quêtes terminées", de: "Erledigte Aufgaben", ja: "達成クエスト", zh: "已完成任务" },
    "stats.repeatsLogged": { en: "Habit repeats logged", ar: "تكرارات مسجَّلة", es: "Repeticiones registradas", fr: "Répétitions enregistrées", de: "Erfasste Wiederholungen", ja: "記録した回数", zh: "已记录次数" },

    // ---- log & inbox ----
    "log.eyebrow": { en: "PROGRESSION LOG", ar: "سجل التقدم", es: "REGISTRO DE PROGRESO", fr: "JOURNAL DE PROGRESSION", de: "FORTSCHRITTSPROTOKOLL", ja: "進捗ログ", zh: "进度日志" },
    "log.title": { en: "Everything that happened", ar: "كل ما حدث", es: "Todo lo que ha pasado", fr: "Tout ce qui s'est passé", de: "Alles, was passiert ist", ja: "これまでの記録", zh: "所有记录" },
    "log.fromSystem": { en: "FROM THE SYSTEM", ar: "من النظام", es: "DEL SISTEMA", fr: "DU SYSTÈME", de: "VOM SYSTEM", ja: "システムより", zh: "来自系统" },
    "log.new": { en: "new", ar: "جديد", es: "nuevo", fr: "nouveau", de: "neu", ja: "新着", zh: "新" },
    "log.expChange": { en: "({sign}{n} EXP)", ar: "({sign}{n} نقطة)", es: "({sign}{n} XP)", fr: "({sign}{n} XP)", de: "({sign}{n} XP)", ja: "({sign}{n} XP)", zh: "({sign}{n} 经验)" },

    // ---- appeals ----
    "appeal.section": { en: "VALUE APPEALS", ar: "اعتراضات على القيمة", es: "APELACIONES DE VALOR", fr: "CONTESTATIONS DE VALEUR", de: "WERT-EINSPRÜCHE", ja: "評価への異議", zh: "数值申诉" },
    "appeal.appealing": { en: "Appealing: {title}", ar: "اعتراض على: {title}", es: "Apelando: {title}", fr: "Contestation : {title}", de: "Einspruch zu: {title}", ja: "異議申立て：{title}", zh: "申诉：{title}" },
    "appeal.reasonPlaceholder": { en: "Why does this value look wrong?", ar: "لماذا تبدو هذه القيمة غير صحيحة؟", es: "¿Por qué parece incorrecto este valor?", fr: "Pourquoi cette valeur semble-t-elle incorrecte ?", de: "Warum wirkt dieser Wert falsch?", ja: "この評価のどこが不適切ですか？", zh: "为什么这个数值看起来不对？" },
    "appeal.submit": { en: "Submit appeal", ar: "إرسال الاعتراض", es: "Enviar apelación", fr: "Envoyer la contestation", de: "Einspruch senden", ja: "異議を送信", zh: "提交申诉" },
    "appeal.submitting": { en: "Submitting…", ar: "جارٍ الإرسال…", es: "Enviando…", fr: "Envoi…", de: "Wird gesendet…", ja: "送信中…", zh: "提交中…" },
    "appeal.needsReason": { en: "Explain why the value looks wrong.", ar: "وضّح لماذا تبدو القيمة غير صحيحة.", es: "Explica por qué el valor parece incorrecto.", fr: "Expliquez pourquoi la valeur semble incorrecte.", de: "Erkläre, warum der Wert falsch wirkt.", ja: "評価が不適切な理由を説明してください。", zh: "请说明数值为何不对。" },
    "appeal.submitted": { en: "Appeal submitted — the system will review it.", ar: "تم إرسال الاعتراض — سيراجعه النظام.", es: "Apelación enviada — el sistema la revisará.", fr: "Contestation envoyée — le Système va l'examiner.", de: "Einspruch gesendet — das System prüft ihn.", ja: "異議を送信しました。システムが確認します。", zh: "申诉已提交 — 系统将进行审核。" },
    "appeal.pending": { en: "Under review", ar: "قيد المراجعة", es: "En revisión", fr: "En cours d'examen", de: "In Prüfung", ja: "確認中", zh: "审核中" },
    "appeal.resolved": { en: "Value corrected", ar: "تم تصحيح القيمة", es: "Valor corregido", fr: "Valeur corrigée", de: "Wert korrigiert", ja: "評価を修正", zh: "数值已更正" },
    "appeal.rejected": { en: "Value unchanged", ar: "القيمة لم تتغير", es: "Valor sin cambios", fr: "Valeur inchangée", de: "Wert unverändert", ja: "評価は変更なし", zh: "数值未更改" },
    "appeal.newValue": { en: " · now {n} xp", ar: " · أصبحت {n} نقطة", es: " · ahora {n} xp", fr: " · maintenant {n} xp", de: " · jetzt {n} XP", ja: " · 現在{n} XP", zh: " · 现为{n}经验" },

    // ---- settings ----
    "settings.title": { en: "System settings", ar: "إعدادات النظام", es: "Ajustes del sistema", fr: "Paramètres du Système", de: "Systemeinstellungen", ja: "システム設定", zh: "系统设置" },
    "settings.appearance": { en: "Appearance", ar: "المظهر", es: "Apariencia", fr: "Apparence", de: "Darstellung", ja: "外観", zh: "外观" },
    "settings.language": { en: "Language", ar: "اللغة", es: "Idioma", fr: "Langue", de: "Sprache", ja: "言語", zh: "语言" },
    "settings.dark": { en: "DARK", ar: "داكن", es: "OSCURO", fr: "SOMBRE", de: "DUNKEL", ja: "ダーク", zh: "深色" },
    "settings.light": { en: "LIGHT", ar: "فاتح", es: "CLARO", fr: "CLAIR", de: "HELL", ja: "ライト", zh: "浅色" },
    "settings.accent": { en: "Accent", ar: "اللون المميز", es: "Color de acento", fr: "Couleur d'accent", de: "Akzentfarbe", ja: "アクセント色", zh: "强调色" },
    "settings.background": { en: "Background", ar: "الخلفية", es: "Fondo", fr: "Arrière-plan", de: "Hintergrund", ja: "背景", zh: "背景" },
    "settings.derivedHint": { en: "Everything else — text, borders, panels — is derived from these so it stays readable.", ar: "كل ما عدا ذلك — النصوص والحدود واللوحات — يُشتق من هذين اللونين ليبقى مقروءًا.", es: "Todo lo demás — texto, bordes, paneles — se deriva de estos para que siga siendo legible.", fr: "Tout le reste — texte, bordures, panneaux — en découle afin de rester lisible.", de: "Alles andere — Text, Rahmen, Flächen — wird davon abgeleitet, damit es lesbar bleibt.", ja: "その他（文字・枠線・パネル）はこれらから導出され、読みやすさが保たれます。", zh: "其余部分（文字、边框、面板）由此推导，以确保可读性。" },
    "settings.backup": { en: "Backup", ar: "النسخ الاحتياطي", es: "Copia de seguridad", fr: "Sauvegarde", de: "Sicherung", ja: "バックアップ", zh: "备份" },
    "settings.export": { en: "Export JSON", ar: "تصدير JSON", es: "Exportar JSON", fr: "Exporter JSON", de: "JSON exportieren", ja: "JSONを書き出す", zh: "导出 JSON" },
    "settings.import": { en: "Import JSON", ar: "استيراد JSON", es: "Importar JSON", fr: "Importer JSON", de: "JSON importieren", ja: "JSONを読み込む", zh: "导入 JSON" },
    "settings.backupHint": { en: "Everything lives only in this browser's local storage — export a backup regularly, especially before clearing browser data.", ar: "كل شيء محفوظ في هذا المتصفح فقط — صدّر نسخة احتياطية بانتظام، خاصة قبل مسح بيانات المتصفح.", es: "Todo se guarda solo en el almacenamiento local de este navegador — exporta una copia con regularidad, sobre todo antes de borrar los datos del navegador.", fr: "Tout est stocké uniquement dans ce navigateur — exportez une sauvegarde régulièrement, surtout avant d'effacer les données du navigateur.", de: "Alles liegt nur im lokalen Speicher dieses Browsers — exportiere regelmäßig eine Sicherung, besonders vor dem Löschen der Browserdaten.", ja: "データはこのブラウザ内にのみ保存されます。特にブラウザのデータを消去する前に、定期的にバックアップを書き出してください。", zh: "所有数据仅保存在此浏览器本地 — 请定期导出备份，尤其是在清除浏览器数据之前。" },
    "settings.danger": { en: "Danger zone", ar: "منطقة الخطر", es: "Zona de peligro", fr: "Zone sensible", de: "Gefahrenzone", ja: "危険な操作", zh: "危险区域" },
    "settings.reset": { en: "Reset to seed data", ar: "إعادة التعيين للبيانات الأصلية", es: "Restablecer a datos iniciales", fr: "Réinitialiser aux données de départ", de: "Auf Ausgangsdaten zurücksetzen", ja: "初期データに戻す", zh: "重置为初始数据" },
    "settings.resetConfirm": { en: "Click again to confirm reset", ar: "اضغط مرة أخرى لتأكيد إعادة التعيين", es: "Haz clic de nuevo para confirmar", fr: "Cliquez à nouveau pour confirmer", de: "Zum Bestätigen erneut klicken", ja: "もう一度クリックして確認", zh: "再次点击以确认" },
    "settings.close": { en: "Close", ar: "إغلاق", es: "Cerrar", fr: "Fermer", de: "Schließen", ja: "閉じる", zh: "关闭" },

    // ---- account ----
    "account.section": { en: "Account & sync", ar: "الحساب والمزامنة", es: "Cuenta y sincronización", fr: "Compte et synchronisation", de: "Konto & Synchronisierung", ja: "アカウントと同期", zh: "账户与同步" },
    "account.notSetUp": { en: "Cloud sync isn't set up for this copy of the app yet — see README.", ar: "المزامنة السحابية غير مفعّلة في هذه النسخة بعد — راجع ملف README.", es: "La sincronización en la nube aún no está configurada en esta copia de la app — consulta el README.", fr: "La synchronisation cloud n'est pas encore configurée pour cette copie — voir le README.", de: "Die Cloud-Synchronisierung ist für diese Kopie noch nicht eingerichtet — siehe README.", ja: "このアプリではクラウド同期がまだ設定されていません。READMEをご覧ください。", zh: "此副本尚未配置云同步 — 请参阅 README。" },
    "account.signedInAs": { en: "Signed in as", ar: "مسجّل الدخول باسم", es: "Sesión iniciada como", fr: "Connecté en tant que", de: "Angemeldet als", ja: "サインイン中：", zh: "已登录：" },
    "account.syncs": { en: "Your progress syncs automatically.", ar: "يتم حفظ تقدمك تلقائيًا.", es: "Tu progreso se sincroniza automáticamente.", fr: "Votre progression est synchronisée automatiquement.", de: "Dein Fortschritt wird automatisch synchronisiert.", ja: "進捗は自動的に同期されます。", zh: "你的进度会自动同步。" },
    "account.signOut": { en: "Sign out", ar: "تسجيل الخروج", es: "Cerrar sesión", fr: "Se déconnecter", de: "Abmelden", ja: "サインアウト", zh: "退出登录" },
    "account.signIn": { en: "SIGN IN", ar: "تسجيل الدخول", es: "INICIAR SESIÓN", fr: "CONNEXION", de: "ANMELDEN", ja: "サインイン", zh: "登录" },
    "account.createAccount": { en: "CREATE ACCOUNT", ar: "إنشاء حساب", es: "CREAR CUENTA", fr: "CRÉER UN COMPTE", de: "KONTO ERSTELLEN", ja: "アカウント作成", zh: "创建账户" },
    "account.continueGoogle": { en: "Continue with Google", ar: "المتابعة بحساب Google", es: "Continuar con Google", fr: "Continuer avec Google", de: "Weiter mit Google", ja: "Googleで続行", zh: "使用 Google 继续" },
    "account.email": { en: "Email", ar: "البريد الإلكتروني", es: "Correo electrónico", fr: "E-mail", de: "E-Mail", ja: "メールアドレス", zh: "电子邮箱" },
    "account.password": { en: "Password (6+ characters)", ar: "كلمة المرور (6 أحرف فأكثر)", es: "Contraseña (6+ caracteres)", fr: "Mot de passe (6+ caractères)", de: "Passwort (6+ Zeichen)", ja: "パスワード（6文字以上）", zh: "密码（6位以上）" },
    "account.forgot": { en: "Forgot password?", ar: "نسيت كلمة المرور؟", es: "¿Olvidaste tu contraseña?", fr: "Mot de passe oublié ?", de: "Passwort vergessen?", ja: "パスワードをお忘れですか？", zh: "忘记密码？" },
    "account.signInBtn": { en: "Sign in", ar: "دخول", es: "Entrar", fr: "Se connecter", de: "Anmelden", ja: "サインイン", zh: "登录" },
    "account.createBtn": { en: "Create account", ar: "إنشاء الحساب", es: "Crear cuenta", fr: "Créer un compte", de: "Konto erstellen", ja: "アカウントを作成", zh: "创建账户" },
    "account.wait": { en: "Please wait…", ar: "يرجى الانتظار…", es: "Espera…", fr: "Veuillez patienter…", de: "Bitte warten…", ja: "お待ちください…", zh: "请稍候…" },
    "account.hint": { en: "Lets you pick up the same progress on another device.", ar: "يتيح لك متابعة تقدمك من جهاز آخر.", es: "Te permite continuar tu progreso en otro dispositivo.", fr: "Vous permet de reprendre votre progression sur un autre appareil.", de: "Ermöglicht dir, deinen Fortschritt auf einem anderen Gerät fortzusetzen.", ja: "別の端末で同じ進捗を続けられます。", zh: "让你在其他设备上继续同一进度。" },
    "account.unverified": { en: "Email not verified yet — check your inbox for the link.", ar: "لم يتم تأكيد البريد بعد — تفقّد بريدك للرابط.", es: "Correo aún no verificado — revisa tu bandeja de entrada.", fr: "E-mail pas encore vérifié — consultez votre boîte de réception.", de: "E-Mail noch nicht bestätigt — sieh in deinem Posteingang nach.", ja: "メールが未確認です。受信トレイをご確認ください。", zh: "邮箱尚未验证 — 请查收邮件。" },
    "account.resend": { en: "Resend email", ar: "إعادة الإرسال", es: "Reenviar correo", fr: "Renvoyer l'e-mail", de: "E-Mail erneut senden", ja: "メールを再送信", zh: "重新发送邮件" },
    "account.needBoth": { en: "Enter an email and password.", ar: "أدخل البريد الإلكتروني وكلمة المرور.", es: "Introduce un correo y una contraseña.", fr: "Saisissez un e-mail et un mot de passe.", de: "Gib E-Mail und Passwort ein.", ja: "メールアドレスとパスワードを入力してください。", zh: "请输入邮箱和密码。" },
    "account.enterEmailFirst": { en: "Enter your email above first, then tap this again.", ar: "أدخل بريدك في الحقل أعلاه أولًا، ثم اضغط هنا مجددًا.", es: "Introduce tu correo arriba primero y vuelve a pulsar aquí.", fr: "Saisissez d'abord votre e-mail ci-dessus, puis recliquez ici.", de: "Gib zuerst oben deine E-Mail ein und klicke dann erneut hier.", ja: "先に上でメールアドレスを入力してから、もう一度押してください。", zh: "请先在上方输入邮箱，然后再次点击。" },
    "account.resetSent": { en: "Password reset email sent — check your inbox.", ar: "تم إرسال رابط إعادة التعيين — تفقّد بريدك.", es: "Correo de restablecimiento enviado — revisa tu bandeja de entrada.", fr: "E-mail de réinitialisation envoyé — consultez votre boîte de réception.", de: "E-Mail zum Zurücksetzen gesendet — sieh in deinem Posteingang nach.", ja: "パスワード再設定メールを送信しました。受信トレイをご確認ください。", zh: "重置密码邮件已发送 — 请查收。" },
    "account.created": { en: "Account created — check your email to verify it.", ar: "تم إنشاء الحساب — تفقّد بريدك لتأكيده.", es: "Cuenta creada — revisa tu correo para verificarla.", fr: "Compte créé — vérifiez votre e-mail pour le confirmer.", de: "Konto erstellt — bestätige es über die E-Mail.", ja: "アカウントを作成しました。メールで確認してください。", zh: "账户已创建 — 请查收邮件完成验证。" },
    "account.popupBlocked": { en: "Your browser blocked the popup — allow popups for this site and try again.", ar: "متصفحك حجب النافذة المنبثقة — اسمح بها لهذا الموقع وحاول مجددًا.", es: "Tu navegador bloqueó la ventana emergente — permítelas para este sitio e inténtalo de nuevo.", fr: "Votre navigateur a bloqué la fenêtre — autorisez les pop-ups pour ce site et réessayez.", de: "Dein Browser hat das Pop-up blockiert — erlaube Pop-ups für diese Seite und versuche es erneut.", ja: "ブラウザがポップアップをブロックしました。このサイトで許可して再試行してください。", zh: "浏览器拦截了弹出窗口 — 请为本站点允许弹窗后重试。" },

    // ---- sync ----
    "sync.title": { en: "Existing account data found", ar: "توجد بيانات محفوظة في حسابك", es: "Se encontraron datos en la cuenta", fr: "Données de compte existantes", de: "Vorhandene Kontodaten gefunden", ja: "アカウントに既存データがあります", zh: "发现账户中已有数据" },
    "sync.body": { en: "Your account already has progress saved from another device. Which copy do you want to keep? The other one will be overwritten.", ar: "حسابك يحتوي على تقدم محفوظ من جهاز آخر. أي نسخة تريد الاحتفاظ بها؟ سيتم استبدال الأخرى.", es: "Tu cuenta ya tiene progreso guardado desde otro dispositivo. ¿Qué copia quieres conservar? La otra se sobrescribirá.", fr: "Votre compte contient déjà une progression enregistrée depuis un autre appareil. Quelle copie souhaitez-vous garder ? L'autre sera écrasée.", de: "Dein Konto enthält bereits Fortschritt von einem anderen Gerät. Welche Kopie möchtest du behalten? Die andere wird überschrieben.", ja: "アカウントには別の端末で保存された進捗があります。どちらを残しますか？もう一方は上書きされます。", zh: "你的账户中已有来自其他设备的进度。要保留哪一份？另一份将被覆盖。" },
    "sync.useCloud": { en: "Use my account's data (this device gets overwritten)", ar: "استخدم بيانات حسابي (سيتم استبدال بيانات هذا الجهاز)", es: "Usar los datos de mi cuenta (se sobrescribe este dispositivo)", fr: "Utiliser les données de mon compte (cet appareil sera écrasé)", de: "Kontodaten verwenden (dieses Gerät wird überschrieben)", ja: "アカウントのデータを使う（この端末は上書き）", zh: "使用账户数据（本设备将被覆盖）" },
    "sync.useLocal": { en: "Use this device's data (your account gets overwritten)", ar: "استخدم بيانات هذا الجهاز (سيتم استبدال بيانات حسابك)", es: "Usar los datos de este dispositivo (se sobrescribe tu cuenta)", fr: "Utiliser les données de cet appareil (votre compte sera écrasé)", de: "Daten dieses Geräts verwenden (dein Konto wird überschrieben)", ja: "この端末のデータを使う（アカウントは上書き）", zh: "使用本设备数据（账户将被覆盖）" },
    "sync.synced": { en: "Synced from another device.", ar: "تمت المزامنة من جهاز آخر.", es: "Sincronizado desde otro dispositivo.", fr: "Synchronisé depuis un autre appareil.", de: "Von einem anderen Gerät synchronisiert.", ja: "別の端末から同期しました。", zh: "已从其他设备同步。" },

    // ---- admin ----
    "admin.eyebrow": { en: "ADMIN", ar: "الإدارة", es: "ADMIN", fr: "ADMIN", de: "ADMIN", ja: "管理", zh: "管理" },
    "admin.title": { en: "Look up a user", ar: "البحث عن مستخدم", es: "Buscar un usuario", fr: "Rechercher un utilisateur", de: "Benutzer suchen", ja: "ユーザーを検索", zh: "查找用户" },
    "admin.searchPlaceholder": { en: "Name or user@example.com", ar: "الاسم أو user@example.com", es: "Nombre o user@example.com", fr: "Nom ou user@example.com", de: "Name oder user@example.com", ja: "名前または user@example.com", zh: "名称或 user@example.com" },
    "admin.search": { en: "Search", ar: "بحث", es: "Buscar", fr: "Rechercher", de: "Suchen", ja: "検索", zh: "搜索" },
    "admin.searching": { en: "Searching…", ar: "جارٍ البحث…", es: "Buscando…", fr: "Recherche…", de: "Suche…", ja: "検索中…", zh: "搜索中…" },
    "admin.enterQuery": { en: "Enter a name or email.", ar: "أدخل اسمًا أو بريدًا إلكترونيًا.", es: "Introduce un nombre o correo.", fr: "Saisissez un nom ou un e-mail.", de: "Gib einen Namen oder eine E-Mail ein.", ja: "名前またはメールアドレスを入力してください。", zh: "请输入名称或邮箱。" },
    "admin.notFound": { en: "No account found with that name or email.", ar: "لا يوجد حساب بهذا الاسم أو البريد.", es: "No se encontró ninguna cuenta con ese nombre o correo.", fr: "Aucun compte trouvé avec ce nom ou cet e-mail.", de: "Kein Konto mit diesem Namen oder dieser E-Mail gefunden.", ja: "その名前またはメールアドレスのアカウントは見つかりません。", zh: "未找到使用该名称或邮箱的账户。" },
    "admin.syncDirHint": { en: "Can't find someone who signed up before this Admin page existed?", ar: "لا تجد شخصًا سجّل قبل وجود صفحة الإدارة؟", es: "¿No encuentras a alguien que se registró antes de que existiera esta página?", fr: "Vous ne trouvez pas quelqu'un inscrit avant l'existence de cette page ?", de: "Findest du jemanden nicht, der sich vor dieser Seite registriert hat?", ja: "この管理ページができる前に登録した人が見つかりませんか？", zh: "找不到在此管理页面出现之前注册的用户？" },
    "admin.syncDir": { en: "Sync directory", ar: "تحديث الدليل", es: "Sincronizar directorio", fr: "Synchroniser l'annuaire", de: "Verzeichnis synchronisieren", ja: "ディレクトリを同期", zh: "同步目录" },
    "admin.nameOrEmail": { en: "Name or email", ar: "الاسم أو البريد", es: "Nombre o correo", fr: "Nom ou e-mail", de: "Name oder E-Mail", ja: "名前またはメール", zh: "名称或邮箱" },
    "name.taken": { en: "That name is already taken.", ar: "هذا الاسم محجوز مسبقًا.", es: "Ese nombre ya está en uso.", fr: "Ce nom est déjà pris.", de: "Dieser Name ist bereits vergeben.", ja: "その名前は既に使われています。", zh: "该名称已被占用。" },
    "sync.pushFailed": { en: "Your progress isn't reaching your account. It's safe on this device, but it isn't being saved online.", ar: "تقدّمك لا يصل إلى حسابك. هو محفوظ على هذا الجهاز، لكنه لا يُحفظ على الإنترنت.", es: "Tu progreso no está llegando a tu cuenta. Está a salvo en este dispositivo, pero no se guarda en línea.", fr: "Votre progression n'atteint pas votre compte. Elle est en sécurité sur cet appareil, mais n'est pas enregistrée en ligne.", de: "Dein Fortschritt erreicht dein Konto nicht. Auf diesem Gerät ist er sicher, online wird er nicht gespeichert.", ja: "進捗がアカウントに届いていません。この端末には保存されていますが、オンラインには保存されていません。", zh: "你的进度没有传到账户。本设备上是安全的，但没有保存到线上。" },
    "sync.pushDeniedAdmin": { en: "(Rejected by the security rules — deploy firestore:rules.)", ar: "(مرفوض من قواعد الأمان — انشر firestore:rules.)", es: "(Rechazado por las reglas de seguridad — despliega firestore:rules.)", fr: "(Rejeté par les règles de sécurité — déployez firestore:rules.)", de: "(Von den Sicherheitsregeln abgelehnt — firestore:rules deployen.)", ja: "（セキュリティルールに拒否されました。firestore:rules をデプロイしてください。）", zh: "（被安全规则拒绝 — 请部署 firestore:rules。）" },
    "sync.corrected": { en: "Corrected to match your record", ar: "تم التصحيح ليطابق سجلك", es: "Corregido para coincidir con tu registro", fr: "Corrigé pour correspondre à votre historique", de: "An deinen Verlauf angeglichen", ja: "記録に合わせて修正されました", zh: "已更正为与你的记录一致" },
    "name.cooldown": { en: "That name was recently changed by its owner. It stays reserved for them for another {days} day(s).", ar: "هذا الاسم غيّره صاحبه مؤخرًا، وسيبقى محجوزًا له {days} يومًا أخرى.", es: "El propietario cambió ese nombre hace poco. Sigue reservado para él {days} día(s) más.", fr: "Ce nom vient d'être changé par son propriétaire. Il lui reste réservé encore {days} jour(s).", de: "Dieser Name wurde kürzlich von seinem Inhaber geändert. Er bleibt noch {days} Tag(e) für ihn reserviert.", ja: "この名前は最近その所有者によって変更されました。あと{days}日間は所有者のために予約されています。", zh: "该名称的持有者最近更改了它，还将为其保留 {days} 天。" },
    "name.hint": { en: "Your name is public and must be unique.", ar: "اسمك ظاهر للجميع ويجب أن يكون فريدًا.", es: "Tu nombre es público y debe ser único.", fr: "Votre nom est public et doit être unique.", de: "Dein Name ist öffentlich und muss eindeutig sein.", ja: "名前は公開され、重複はできません。", zh: "你的名称是公开的，且必须唯一。" },
    "admin.standingFrom": { en: "Journalled EXP:", ar: "الخبرة المسجّلة:", es: "EXP registrada:", fr: "EXP journalisée :", de: "Protokollierte EXP:", ja: "記録されたEXP：", zh: "已记录经验：" },
    "admin.unbacked": { en: "not backed by a recorded price ({pct}%)", ar: "غير مدعومة بسعر مسجّل ({pct}%)", es: "sin precio registrado que la respalde ({pct}%)", fr: "sans prix enregistré pour l'appuyer ({pct}%)", de: "ohne hinterlegten Preis belegt ({pct}%)", ja: "記録された価格の裏づけなし（{pct}%）", zh: "无已记录价格支持（{pct}%）" },
    "admin.allBacked": { en: "all backed by recorded prices", ar: "كلها مدعومة بأسعار مسجّلة", es: "toda respaldada por precios registrados", fr: "entièrement appuyée par des prix enregistrés", de: "vollständig durch hinterlegte Preise belegt", ja: "すべて記録された価格に裏づけあり", zh: "全部有已记录价格支持" },
    "admin.syncBoard": { en: "Sync leaderboard", ar: "تحديث لوحة الصدارة", es: "Sincronizar clasificación", fr: "Synchroniser le classement", de: "Rangliste synchronisieren", ja: "ランキングを同期", zh: "同步排行榜" },
    "admin.syncNames": { en: "Reserve existing names", ar: "حجز الأسماء الحالية", es: "Reservar nombres existentes", fr: "Réserver les noms existants", de: "Bestehende Namen reservieren", ja: "既存の名前を予約", zh: "预留现有名称" },
    "name.unclaimed": { en: "Your name isn't reserved yet — set it to claim it.", ar: "اسمك غير محجوز بعد — عدّله لحجزه.", es: "Tu nombre aún no está reservado — cámbialo para reclamarlo.", fr: "Votre nom n'est pas encore réservé — modifiez-le pour le revendiquer.", de: "Dein Name ist noch nicht reserviert — setze ihn, um ihn zu beanspruchen.", ja: "名前がまだ予約されていません。設定して確保してください。", zh: "你的名称尚未预留 — 请设置以占用它。" },
    "admin.result": { en: "Result", ar: "النتيجة", es: "Resultado", fr: "Résultat", de: "Ergebnis", ja: "結果", zh: "结果" },
    "admin.rank": { en: "Rank", ar: "الرتبة", es: "Rango", fr: "Rang", de: "Rang", ja: "ランク", zh: "等级" },
    "admin.level": { en: "Level", ar: "المستوى", es: "Nivel", fr: "Niveau", de: "Level", ja: "レベル", zh: "级别" },
    "admin.exp": { en: "EXP", ar: "النقاط", es: "XP", fr: "XP", de: "XP", ja: "XP", zh: "经验" },
    "admin.questsDone": { en: "Quests done", ar: "مهام مكتملة", es: "Misiones hechas", fr: "Quêtes terminées", de: "Erledigte Aufgaben", ja: "達成クエスト", zh: "已完成任务" },
    "admin.noProgress": { en: "No saved progress yet for this account.", ar: "لا يوجد تقدم محفوظ لهذا الحساب بعد.", es: "Esta cuenta aún no tiene progreso guardado.", fr: "Ce compte n'a pas encore de progression enregistrée.", de: "Für dieses Konto ist noch kein Fortschritt gespeichert.", ja: "このアカウントにはまだ保存された進捗がありません。", zh: "该账户尚无已保存的进度。" },
    "admin.currently": { en: "Currently: {status}", ar: "الحالة: {status}", es: "Actualmente: {status}", fr: "Actuellement : {status}", de: "Aktuell: {status}", ja: "現在：{status}", zh: "当前：{status}" },
    "admin.isAdmin": { en: "an admin", ar: "مسؤول", es: "administrador", fr: "administrateur", de: "Administrator", ja: "管理者", zh: "管理员" },
    "admin.notAdmin": { en: "not an admin", ar: "ليس مسؤولًا", es: "no es administrador", fr: "pas administrateur", de: "kein Administrator", ja: "管理者ではない", zh: "非管理员" },
    "admin.makeAdmin": { en: "Make admin", ar: "تعيين كمسؤول", es: "Hacer administrador", fr: "Nommer administrateur", de: "Zum Admin machen", ja: "管理者にする", zh: "设为管理员" },
    "admin.removeAdmin": { en: "Remove admin", ar: "إزالة الصلاحية", es: "Quitar administrador", fr: "Retirer les droits", de: "Adminrechte entziehen", ja: "管理者を解除", zh: "移除管理员" },
    "admin.sendMessage": { en: "Send message / adjust EXP", ar: "إرسال رسالة / تعديل النقاط", es: "Enviar mensaje / ajustar XP", fr: "Envoyer un message / ajuster l'XP", de: "Nachricht senden / XP anpassen", ja: "メッセージ送信 / XP調整", zh: "发送消息 / 调整经验" },
    "admin.messagePlaceholder": { en: "Message to this user...", ar: "رسالة لهذا المستخدم...", es: "Mensaje para este usuario...", fr: "Message pour cet utilisateur...", de: "Nachricht an diesen Benutzer...", ja: "このユーザーへのメッセージ...", zh: "给该用户的消息..." },
    "admin.amountPlaceholder": { en: "EXP amount (optional, can be negative)", ar: "مقدار النقاط (اختياري، يمكن أن يكون سالبًا)", es: "Cantidad de XP (opcional, puede ser negativa)", fr: "Montant d'XP (facultatif, peut être négatif)", de: "XP-Betrag (optional, kann negativ sein)", ja: "XP量（任意・マイナス可）", zh: "经验数量（可选，可为负）" },
    "admin.send": { en: "Send", ar: "إرسال", es: "Enviar", fr: "Envoyer", de: "Senden", ja: "送信", zh: "发送" },
    "admin.sending": { en: "Sending…", ar: "جارٍ الإرسال…", es: "Enviando…", fr: "Envoi…", de: "Wird gesendet…", ja: "送信中…", zh: "发送中…" },
    "admin.adjustHint": { en: "Leave the amount blank (or 0) to just send a message with no EXP change. Negative values apply a penalty.", ar: "اترك المقدار فارغًا (أو 0) لإرسال رسالة دون تغيير النقاط. القيم السالبة تطبّق عقوبة.", es: "Deja la cantidad vacía (o 0) para enviar solo un mensaje sin cambiar la XP. Los valores negativos aplican una penalización.", fr: "Laissez le montant vide (ou 0) pour envoyer un simple message sans changer l'XP. Les valeurs négatives appliquent une pénalité.", de: "Lass den Betrag leer (oder 0), um nur eine Nachricht ohne XP-Änderung zu senden. Negative Werte bewirken einen Abzug.", ja: "XPを変更せずメッセージだけ送るには空欄（または0）にします。マイナス値はペナルティになります。", zh: "留空（或填0）则仅发送消息、不改变经验。负值表示扣分。" },
    "admin.needMessage": { en: "Write a message first.", ar: "اكتب رسالة أولًا.", es: "Escribe un mensaje primero.", fr: "Écrivez d'abord un message.", de: "Schreibe zuerst eine Nachricht.", ja: "先にメッセージを入力してください。", zh: "请先写一条消息。" },
    "admin.appealQueue": { en: "VALUE APPEALS", ar: "اعتراضات على القيمة", es: "APELACIONES DE VALOR", fr: "CONTESTATIONS DE VALEUR", de: "WERT-EINSPRÜCHE", ja: "評価への異議", zh: "数值申诉" },
    "admin.refresh": { en: "Refresh", ar: "تحديث", es: "Actualizar", fr: "Actualiser", de: "Aktualisieren", ja: "更新", zh: "刷新" },
    "admin.nothingPending": { en: "Nothing pending.", ar: "لا شيء معلّق.", es: "Nada pendiente.", fr: "Rien en attente.", de: "Nichts offen.", ja: "保留中の項目はありません。", zh: "没有待处理项。" },
    "admin.current": { en: "Current", ar: "الحالية", es: "Actual", fr: "Actuelle", de: "Aktuell", ja: "現在", zh: "当前" },
    "admin.kind": { en: "Kind", ar: "النوع", es: "Tipo", fr: "Type", de: "Art", ja: "種類", zh: "类型" },
    "admin.theirReason": { en: "Their reason:", ar: "سببه:", es: "Su motivo:", fr: "Son motif :", de: "Ihre Begründung:", ja: "本人の理由：", zh: "其理由：" },
    "admin.from": { en: "from {uid}", ar: "من {uid}", es: "de {uid}", fr: "de {uid}", de: "von {uid}", ja: "{uid} より", zh: "来自 {uid}" },
    "admin.correctedXp": { en: "Corrected xp", ar: "القيمة المصححة", es: "XP corregida", fr: "XP corrigée", de: "Korrigierte XP", ja: "修正後XP", zh: "更正后经验" },
    "admin.correctValue": { en: "Correct value", ar: "تصحيح القيمة", es: "Corregir valor", fr: "Corriger la valeur", de: "Wert korrigieren", ja: "評価を修正", zh: "更正数值" },
    "admin.uphold": { en: "Keep current value", ar: "إبقاء القيمة الحالية", es: "Mantener el valor actual", fr: "Conserver la valeur actuelle", de: "Aktuellen Wert beibehalten", ja: "現在の評価を維持", zh: "保持当前数值" },
    "admin.needValue": { en: "Enter the corrected value first.", ar: "أدخل القيمة المصححة أولًا.", es: "Introduce primero el valor corregido.", fr: "Saisissez d'abord la valeur corrigée.", de: "Gib zuerst den korrigierten Wert ein.", ja: "先に修正後の値を入力してください。", zh: "请先输入更正后的数值。" },
    "admin.quest": { en: "quest", ar: "مهمة", es: "misión", fr: "quête", de: "Aufgabe", ja: "クエスト", zh: "任务" },
    "admin.habit": { en: "habit", ar: "عادة", es: "hábito", fr: "habitude", de: "Gewohnheit", ja: "習慣", zh: "习惯" },

    // ---- notifications ----
    "notif.levelup": { en: "LEVEL UP", ar: "ترقية مستوى", es: "SUBISTE DE NIVEL", fr: "NIVEAU SUPÉRIEUR", de: "LEVEL-AUFSTIEG", ja: "レベルアップ", zh: "等级提升" },
    "notif.skillpoint": { en: "STAT INVESTED", ar: "تم استثمار نقطة", es: "PUNTO INVERTIDO", fr: "POINT INVESTI", de: "PUNKT INVESTIERT", ja: "ポイント投入", zh: "点数已投入" },
    "notif.info": { en: "SYSTEM", ar: "النظام", es: "SISTEMA", fr: "SYSTÈME", de: "SYSTEM", ja: "システム", zh: "系统" },
    "notif.expLoss": { en: "PROGRESS ADJUSTED", ar: "تم تعديل التقدم", es: "PROGRESO AJUSTADO", fr: "PROGRESSION AJUSTÉE", de: "FORTSCHRITT ANGEPASST", ja: "進捗を調整", zh: "进度已调整" },
    "notif.delevel": { en: "LEVEL REVERTED", ar: "تراجع المستوى", es: "NIVEL REVERTIDO", fr: "NIVEAU RÉTABLI", de: "LEVEL ZURÜCKGESETZT", ja: "レベルを戻しました", zh: "等级已回退" },
    "notif.rankdown": { en: "RANK DOWN", ar: "انخفاض الرتبة", es: "BAJADA DE RANGO", fr: "RÉTROGRADATION", de: "RANGVERLUST", ja: "ランクダウン", zh: "等级下降" },
    "notif.exp": { en: "QUEST PROGRESS", ar: "تقدم المهمة", es: "PROGRESO DE MISIÓN", fr: "PROGRESSION DE QUÊTE", de: "AUFGABENFORTSCHRITT", ja: "クエスト進捗", zh: "任务进度" },
    "rankup.notice": { en: "System notice", ar: "إشعار من النظام", es: "Aviso del sistema", fr: "Avis du Système", de: "Systemmeldung", ja: "システム通知", zh: "系统通知" },
    "rankup.dismiss": { en: "click anywhere to continue", ar: "اضغط في أي مكان للمتابعة", es: "haz clic en cualquier lugar para continuar", fr: "cliquez n'importe où pour continuer", de: "klicke irgendwohin, um fortzufahren", ja: "どこでもクリックして続行", zh: "点击任意处继续" },
    "rankup.aria": { en: "Rank up", ar: "ترقية رتبة", es: "Subida de rango", fr: "Montée de rang", de: "Rangaufstieg", ja: "ランクアップ", zh: "等级提升" },


    // ---- units (display only — the stored value stays the English key, so
    // switching language never rewrites saved task data) ----
    "unitGroup.Count": { en: "Count", ar: "عدد", es: "Cantidad", fr: "Nombre", de: "Anzahl", ja: "回数", zh: "计数" },
    "unitGroup.Time": { en: "Time", ar: "وقت", es: "Tiempo", fr: "Durée", de: "Zeit", ja: "時間", zh: "时间" },
    "unitGroup.Volume": { en: "Volume", ar: "حجم", es: "Volumen", fr: "Volume", de: "Volumen", ja: "容量", zh: "容量" },
    "unitGroup.Distance": { en: "Distance", ar: "مسافة", es: "Distancia", fr: "Distance", de: "Distanz", ja: "距離", zh: "距离" },
    "unitGroup.Weight": { en: "Weight", ar: "وزن", es: "Peso", fr: "Poids", de: "Gewicht", ja: "重さ", zh: "重量" },
    "unit.reps": { en: "reps", ar: "تكرار", es: "reps", fr: "reps", de: "Wdh.", ja: "回", zh: "次" },
    "unit.times": { en: "times", ar: "مرة", es: "veces", fr: "fois", de: "Mal", ja: "回", zh: "遍" },
    "unit.pages": { en: "pages", ar: "صفحة", es: "págs.", fr: "pages", de: "Seiten", ja: "ページ", zh: "页" },
    "unit.steps": { en: "steps", ar: "خطوة", es: "pasos", fr: "pas", de: "Schritte", ja: "歩", zh: "步" },
    "unit.sets": { en: "sets", ar: "مجموعة", es: "series", fr: "séries", de: "Sätze", ja: "セット", zh: "组" },
    "unit.sec": { en: "sec", ar: "ثانية", es: "seg", fr: "sec", de: "Sek.", ja: "秒", zh: "秒" },
    "unit.min": { en: "min", ar: "دقيقة", es: "min", fr: "min", de: "Min.", ja: "分", zh: "分钟" },
    "unit.hr": { en: "hr", ar: "ساعة", es: "h", fr: "h", de: "Std.", ja: "時間", zh: "小时" },
    "unit.ml": { en: "ml", ar: "مل", es: "ml", fr: "ml", de: "ml", ja: "ml", zh: "毫升" },
    "unit.L": { en: "L", ar: "لتر", es: "L", fr: "L", de: "L", ja: "L", zh: "升" },
    "unit.m": { en: "m", ar: "م", es: "m", fr: "m", de: "m", ja: "m", zh: "米" },
    "unit.km": { en: "km", ar: "كم", es: "km", fr: "km", de: "km", ja: "km", zh: "公里" },
    "unit.g": { en: "g", ar: "غم", es: "g", fr: "g", de: "g", ja: "g", zh: "克" },
    "unit.kg": { en: "kg", ar: "كغم", es: "kg", fr: "kg", de: "kg", ja: "kg", zh: "千克" },

    "settings.rules": { en: "Rules", ar: "قواعد النظام", es: "Reglas", fr: "Règles", de: "Regeln", ja: "ルール", zh: "规则" },
    "settings.rulesFixed": { en: "A task's value is its EXP. Every rank is 100 levels — what changes is what a level costs, and how many skill points the work earns. Points come from the EXP itself, not from levels, and are placed automatically where the work built them. The same for everyone, and not adjustable.", ar: "قيمة المهمة هي نقاط خبرتها. كل رتبة 100 مستوى — المتغيّر هو كلفة المستوى ومعدّل نقاط القوة. النقاط تأتي من الخبرة نفسها لا من المستويات، وتوضع تلقائيًا حيث بناها عملك. القواعد واحدة للجميع وغير قابلة للتعديل.", es: "El valor de una tarea es su EXP. Cada rango son 100 niveles: lo que cambia es cuánto cuesta un nivel y cuántos puntos de habilidad otorga. Los puntos se asignan automáticamente donde el trabajo los construyó. Igual para todos y no ajustable.", fr: "La valeur d'une tâche est son EXP. Chaque rang fait 100 niveaux — ce qui change, c'est le coût d'un niveau et le nombre de points qu'il accorde. Les points sont placés automatiquement là où le travail les a bâtis. Identique pour tous et non modifiable.", de: "Der Wert einer Aufgabe ist ihre EXP. Jeder Rang umfasst 100 Level — was sich ändert, ist der Preis eines Levels und wie viele Fertigkeitspunkte es gewährt. Punkte werden automatisch dort verteilt, wo die Arbeit sie aufgebaut hat. Für alle gleich und nicht änderbar.", ja: "タスクの価値がそのままEXPです。各ランクは100レベル。変わるのはレベルの価格と、そこで得られるスキルポイント数です。ポイントはその働きが伸ばした場所へ自動的に配分されます。全員共通で変更できません。", zh: "任务的价值就是它的经验值。每个等级都是 100 级 — 变化的是升一级的花费和授予的技能点数。点数自动分配到你的努力所构建的位置。所有人一致，不可更改。" },
    "settings.perLevel": { en: "{n} xp / level", ar: "{n} نقطة / مستوى", es: "{n} xp / nivel", fr: "{n} xp / niveau", de: "{n} XP / Level", ja: "{n} XP / レベル", zh: "{n} 经验 / 级" },
    "settings.pointsRate": { en: "{n} pt / 100 xp", ar: "{n} نقطة / 100 خبرة", es: "{n} pt / 100 xp", fr: "{n} pt / 100 xp", de: "{n} P / 100 XP", ja: "{n} ポイント / 100 XP", zh: "{n} 点 / 100 经验" },
    "common.loading": { en: "Loading…", ar: "جارٍ التحميل…", es: "Cargando…", fr: "Chargement…", de: "Wird geladen…", ja: "読み込み中…", zh: "正在加载…" },
    "stats.lifetime": { en: "All time", ar: "كل الوقت", es: "Histórico", fr: "Tout l'historique", de: "Gesamt", ja: "全期間", zh: "全部时间" },
    "stats.sinceRecordBegan": { en: "Since {month}, when the record began", ar: "منذ {month}، بداية السجل", es: "Desde {month}, cuando comenzó el registro", fr: "Depuis {month}, début de l'historique", de: "Seit {month}, dem Beginn der Aufzeichnung", ja: "記録開始の{month}以降", zh: "自记录开始的 {month} 起" },
    "stats.bestMonth": { en: "Strongest month so far: {month}", ar: "أقوى شهر حتى الآن: {month}", es: "Mejor mes hasta ahora: {month}", fr: "Meilleur mois jusqu'ici : {month}", de: "Bisher stärkster Monat: {month}", ja: "これまでで最も伸びた月：{month}", zh: "目前最强的月份：{month}" },
    "stats.lifetimeEmpty": { en: "Nothing recorded yet — this fills in as you go.", ar: "لا شيء مسجّل بعد — سيمتلئ مع الوقت.", es: "Aún no hay nada registrado: se irá llenando sobre la marcha.", fr: "Rien d'enregistré pour l'instant — cela se remplira au fil du temps.", de: "Noch nichts aufgezeichnet — das füllt sich mit der Zeit.", ja: "まだ記録がありません。続けるうちに埋まっていきます。", zh: "还没有记录 — 会随着使用逐渐填满。" },
    "stats.lifetimeSignedOut": { en: "Sign in to keep a long-term record.", ar: "سجّل الدخول للاحتفاظ بسجل طويل المدى.", es: "Inicia sesión para conservar un registro a largo plazo.", fr: "Connectez-vous pour conserver un historique de long terme.", de: "Melde dich an, um einen Langzeitverlauf zu führen.", ja: "長期の記録を残すにはサインインしてください。", zh: "登录以保留长期记录。" },

    // ---- weekly directives ----
    "suggest.eyebrow": { en: "THIS WEEK'S DIRECTIVES", ar: "توجيهات هذا الأسبوع", es: "DIRECTIVAS DE ESTA SEMANA", fr: "DIRECTIVES DE LA SEMAINE", de: "DIREKTIVEN DIESER WOCHE", ja: "今週の指令", zh: "本周指令" },
    "suggest.weekly": { en: "Chosen from what you've left alone. Take what you want.", ar: "مختارة مما أهملته. خذ ما يناسبك.", es: "Elegidas a partir de lo que has dejado de lado. Toma lo que quieras.", fr: "Choisies d'après ce que vous avez délaissé. Prenez ce qui vous convient.", de: "Ausgewählt nach dem, was du liegen gelassen hast. Nimm, was du willst.", ja: "手つかずの領域から選ばれています。好きなものを選んでください。", zh: "根据你忽略的方面选出。挑你想要的。" },
    "suggest.drawing": { en: "Drawing up this week's directives…", ar: "جارٍ إعداد توجيهات هذا الأسبوع…", es: "Preparando las directivas de esta semana…", fr: "Préparation des directives de la semaine…", de: "Direktiven dieser Woche werden erstellt…", ja: "今週の指令を作成中…", zh: "正在拟定本周指令…" },
    "suggest.failed": { en: "Couldn't draw up this week's directives.", ar: "تعذّر إعداد توجيهات هذا الأسبوع.", es: "No se pudieron preparar las directivas de esta semana.", fr: "Impossible de préparer les directives de cette semaine.", de: "Die Direktiven dieser Woche konnten nicht erstellt werden.", ja: "今週の指令を作成できませんでした。", zh: "无法拟定本周指令。" },
    "suggest.allAnswered": { en: "Every directive this week has been answered. New ones next week.", ar: "تمت الإجابة على كل توجيهات هذا الأسبوع. الجديد الأسبوع القادم.", es: "Has respondido a todas las directivas de esta semana. Habrá nuevas la próxima.", fr: "Toutes les directives de cette semaine ont reçu une réponse. De nouvelles la semaine prochaine.", de: "Alle Direktiven dieser Woche sind beantwortet. Nächste Woche gibt es neue.", ja: "今週の指令にはすべて回答済みです。新しい指令は来週。", zh: "本周的指令都已回应。下周会有新的。" },
    "suggest.worth": { en: "+{n} xp", ar: "+{n} نقطة", es: "+{n} xp", fr: "+{n} xp", de: "+{n} XP", ja: "+{n} XP", zh: "+{n} 经验" },
    "suggest.worthPerRepeat": { en: "+{n} xp / repeat", ar: "+{n} نقطة / مرة", es: "+{n} xp / repetición", fr: "+{n} xp / répétition", de: "+{n} XP / Wdh.", ja: "+{n} XP / 回", zh: "+{n} 经验 / 次" },
    "suggest.cadence": { en: "{n}× a week · {amount} {unit} each time", ar: "{n}× أسبوعيًا · {amount} {unit} في كل مرة", es: "{n}× por semana · {amount} {unit} cada vez", fr: "{n}× par semaine · {amount} {unit} à chaque fois", de: "{n}× pro Woche · jeweils {amount} {unit}", ja: "週{n}回 · 毎回 {amount} {unit}", zh: "每周 {n} 次 · 每次 {amount} {unit}" },
    "suggest.accept": { en: "Accept", ar: "قبول", es: "Aceptar", fr: "Accepter", de: "Annehmen", ja: "受ける", zh: "接受" },
    "suggest.decline": { en: "Not this one", ar: "ليس هذا", es: "Este no", fr: "Pas celle-ci", de: "Diese nicht", ja: "これは見送る", zh: "这个不要" },
    "suggest.accepted": { en: "Accepted — {title} is now in your quests.", ar: "تم القبول — {title} أصبحت ضمن مهامك.", es: "Aceptada: {title} ya está en tus misiones.", fr: "Acceptée — {title} est maintenant dans vos quêtes.", de: "Angenommen — {title} ist jetzt in deinen Aufgaben.", ja: "受諾しました — {title} をクエストに追加しました。", zh: "已接受 — {title} 已加入你的任务。" },

    // ---- leaderboard ----
    "lb.eyebrow": { en: "GLOBAL RANKING", ar: "الترتيب العالمي", es: "CLASIFICACIÓN GLOBAL", fr: "CLASSEMENT MONDIAL", de: "GLOBALE RANGLISTE", ja: "グローバルランキング", zh: "全球排行" },
    "lb.title": { en: "Leaderboard", ar: "لوحة الصدارة", es: "Tabla de clasificación", fr: "Tableau des scores", de: "Bestenliste", ja: "リーダーボード", zh: "排行榜" },
    "lb.subtitle": { en: "Everyone who has reserved a display name, ordered by total EXP earned.", ar: "كل من حجز اسمًا معروضًا، مرتّبين حسب مجموع نقاط الخبرة.", es: "Todos los que han reservado un nombre visible, ordenados por EXP total.", fr: "Toutes les personnes ayant réservé un nom affiché, classées par EXP total.", de: "Alle mit reserviertem Anzeigenamen, sortiert nach Gesamt-EXP.", ja: "表示名を確保したすべてのプレイヤーを、累計EXP順に並べています。", zh: "所有已保留显示名称的玩家，按累计经验值排序。" },
    "lb.signedOut": { en: "Sign in to see the global ranking.", ar: "سجّل الدخول لرؤية الترتيب العالمي.", es: "Inicia sesión para ver la clasificación global.", fr: "Connectez-vous pour voir le classement mondial.", de: "Melde dich an, um die globale Rangliste zu sehen.", ja: "グローバルランキングを見るにはサインインしてください。", zh: "登录后查看全球排行榜。" },
    "lb.unclaimedName": { en: "Your display name isn't reserved yet, so you don't appear here. Reserve it in Settings.", ar: "اسمك المعروض غير محجوز بعد، لذلك لا تظهر هنا. احجزه من الإعدادات.", es: "Tu nombre visible aún no está reservado, así que no apareces aquí. Resérvalo en Ajustes.", fr: "Votre nom affiché n'est pas encore réservé, vous n'apparaissez donc pas ici. Réservez-le dans les Paramètres.", de: "Dein Anzeigename ist noch nicht reserviert, deshalb erscheinst du hier nicht. Reserviere ihn in den Einstellungen.", ja: "表示名がまだ確保されていないため、ここには表示されません。設定から確保してください。", zh: "你的显示名称尚未保留，因此不会出现在这里。请在设置中保留。" },
    "lb.loading": { en: "Loading the ranking…", ar: "جارٍ تحميل الترتيب…", es: "Cargando la clasificación…", fr: "Chargement du classement…", de: "Rangliste wird geladen…", ja: "ランキングを読み込み中…", zh: "正在加载排行榜…" },
    "lb.empty": { en: "Nobody is ranked yet. Be the first.", ar: "لا أحد في الترتيب بعد. كن الأول.", es: "Todavía no hay nadie clasificado. Sé el primero.", fr: "Personne n'est encore classé. Soyez le premier.", de: "Noch ist niemand platziert. Sei der Erste.", ja: "まだ誰もランクインしていません。最初の一人になりましょう。", zh: "还没有人上榜。成为第一个吧。" },
    "lb.error": { en: "Couldn't load the ranking.", ar: "تعذّر تحميل الترتيب.", es: "No se pudo cargar la clasificación.", fr: "Impossible de charger le classement.", de: "Die Rangliste konnte nicht geladen werden.", ja: "ランキングを読み込めませんでした。", zh: "无法加载排行榜。" },
    "lb.refresh": { en: "Refresh", ar: "تحديث", es: "Actualizar", fr: "Actualiser", de: "Aktualisieren", ja: "更新", zh: "刷新" },
    "lb.you": { en: "You", ar: "أنت", es: "Tú", fr: "Vous", de: "Du", ja: "あなた", zh: "你" },
    "lb.colPlayer": { en: "PLAYER", ar: "اللاعب", es: "JUGADOR", fr: "JOUEUR", de: "SPIELER", ja: "プレイヤー", zh: "玩家" },
    "lb.colQuests": { en: "QUESTS", ar: "المهام", es: "MISIONES", fr: "QUÊTES", de: "AUFGABEN", ja: "クエスト", zh: "任务" },
    "lb.colTotal": { en: "TOTAL EXP", ar: "مجموع الخبرة", es: "EXP TOTAL", fr: "EXP TOTAL", de: "GESAMT-EXP", ja: "累計EXP", zh: "累计经验" },
    "lb.playerLine": { en: "{rank}-Rank · Lv {level}", ar: "رتبة {rank} · مستوى {level}", es: "Rango {rank} · Niv {level}", fr: "Rang {rank} · Niv {level}", de: "Rang {rank} · Lv {level}", ja: "{rank}ランク · Lv {level}", zh: "{rank}级 · 等级{level}" },
    "lb.outsideTop": { en: "You're outside the top {n} — your own standing is below.", ar: "أنت خارج أفضل {n} — ترتيبك بالأسفل.", es: "Estás fuera del top {n}: tu posición está abajo.", fr: "Vous êtes hors du top {n} — votre position est ci-dessous.", de: "Du bist außerhalb der Top {n} — deine Platzierung steht unten.", ja: "上位{n}位圏外です — あなたの順位は下にあります。", zh: "你不在前{n}名内 — 你的名次见下方。" },
    "lb.positionUnknown": { en: "Position unavailable", ar: "الترتيب غير متاح", es: "Posición no disponible", fr: "Position indisponible", de: "Platzierung nicht verfügbar", ja: "順位を取得できません", zh: "名次不可用" },
    "lb.pending": { en: "You'll appear here once your next change syncs.", ar: "ستظهر هنا بعد مزامنة تغييرك التالي.", es: "Aparecerás aquí cuando se sincronice tu próximo cambio.", fr: "Vous apparaîtrez ici après la synchronisation de votre prochaine modification.", de: "Du erscheinst hier, sobald deine nächste Änderung synchronisiert wurde.", ja: "次の変更が同期されるとここに表示されます。", zh: "下次更改同步后你将出现在这里。" },

    // ---- new version available ----
    "notif.levelReached": { en: "Level {n}", ar: "المستوى {n}", es: "Nivel {n}", fr: "Niveau {n}", de: "Level {n}", ja: "レベル {n}", zh: "等级 {n}" },
    "notif.levelsGained": { en: "Level {n} — {count} levels gained", ar: "المستوى {n} — {count} مستويات", es: "Nivel {n} — {count} niveles ganados", fr: "Niveau {n} — {count} niveaux gagnés", de: "Level {n} — {count} Level erreicht", ja: "レベル {n} — {count} レベル上昇", zh: "等级 {n} — 提升 {count} 级" },
    "notif.levelLost": { en: "Level {n} (progress reverted)", ar: "المستوى {n} (تم التراجع)", es: "Nivel {n} (progreso revertido)", fr: "Niveau {n} (progression annulée)", de: "Level {n} (Fortschritt zurückgenommen)", ja: "レベル {n}（進捗を取り消し）", zh: "等级 {n}（进度已回退）" },
    "notif.levelsLost": { en: "Level {n} — {count} levels reverted", ar: "المستوى {n} — تم التراجع عن {count} مستويات", es: "Nivel {n} — {count} niveles revertidos", fr: "Niveau {n} — {count} niveaux annulés", de: "Level {n} — {count} Level zurückgenommen", ja: "レベル {n} — {count} レベル取り消し", zh: "等级 {n} — 回退 {count} 级" },
    "notif.dismiss": { en: "Click to dismiss", ar: "اضغط للإخفاء", es: "Clic para descartar", fr: "Cliquez pour fermer", de: "Zum Ausblenden klicken", ja: "クリックして閉じる", zh: "点击关闭" },
    "notif.update": { en: "UPDATE", ar: "تحديث", es: "ACTUALIZACIÓN", fr: "MISE À JOUR", de: "UPDATE", ja: "アップデート", zh: "更新" },
    "update.available": { en: "A new version of The System is ready.", ar: "نسخة جديدة من ذا سيستم جاهزة.", es: "Hay una nueva versión de The System lista.", fr: "Une nouvelle version de The System est prête.", de: "Eine neue Version von The System ist bereit.", ja: "The System の新しいバージョンが利用可能です。", zh: "The System 有新版本可用。" },
    "update.reload": { en: "Reload", ar: "إعادة التحميل", es: "Recargar", fr: "Recharger", de: "Neu laden", ja: "再読み込み", zh: "重新加载" },
    "update.later": { en: "Later", ar: "لاحقًا", es: "Más tarde", fr: "Plus tard", de: "Später", ja: "後で", zh: "稍后" },

    // ---- misc ----
    "common.backupDownloaded": { en: "Backup downloaded.", ar: "تم تنزيل النسخة الاحتياطية.", es: "Copia de seguridad descargada.", fr: "Sauvegarde téléchargée.", de: "Sicherung heruntergeladen.", ja: "バックアップをダウンロードしました。", zh: "备份已下载。" },
    "common.backupImported": { en: "Backup imported successfully.", ar: "تم استيراد النسخة الاحتياطية بنجاح.", es: "Copia de seguridad importada correctamente.", fr: "Sauvegarde importée avec succès.", de: "Sicherung erfolgreich importiert.", ja: "バックアップを読み込みました。", zh: "备份导入成功。" },
  };

  let current = "en";

  SYS.setLanguageCode = function (code) {
    current = SYS.LANGUAGES[code] ? code : "en";
  };
  SYS.currentLanguage = function () { return current; };
  SYS.currentDir = function () { return SYS.LANGUAGES[current].dir; };

  // Falls back to English, then to the key itself — a missing translation
  // shows readable text instead of blanking out the interface.
  // Units and unit groups can be user-typed custom values with no entry at
  // all; those must display as-is rather than as a raw key.
  SYS.tUnit = function (unit) {
    return STRINGS["unit." + unit] ? SYS.t("unit." + unit) : unit;
  };
  SYS.tUnitGroup = function (label) {
    return STRINGS["unitGroup." + label] ? SYS.t("unitGroup." + label) : label;
  };

  SYS.t = function (key, vars) {
    const entry = STRINGS[key];
    let s = entry ? (entry[current] || entry.en) : key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        s = s.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return s;
  };
})(window.SYS = window.SYS || {});
