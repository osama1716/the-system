// Translations. Adding a language = adding its code to LANGUAGES and a value
// under each key below; anything left untranslated falls back to English
// rather than breaking, so a partial language is a usable one.
(function (SYS) {
  "use strict";

  SYS.LANGUAGES = {
    en: { name: "English", dir: "ltr" },
    ar: { name: "العربية", dir: "rtl" },
  };

  const STRINGS = {
    // ---- navigation & chrome ----
    "nav.overview": { en: "Overview", ar: "نظرة عامة" },
    "nav.quests": { en: "Quests", ar: "المهام" },
    "nav.habits": { en: "Habits", ar: "العادات" },
    "nav.stats": { en: "Stats", ar: "الإحصائيات" },
    "nav.intelligence": { en: "Intelligence", ar: "الذكاءات" },
    "nav.log": { en: "Log", ar: "السجل" },
    "nav.admin": { en: "Admin", ar: "الإدارة" },
    "nav.settings": { en: "Settings", ar: "الإعدادات" },
    "status.rename": { en: "Click to rename", ar: "اضغط لتغيير الاسم" },
    "status.rank": { en: "{rank}-RANK", ar: "رتبة {rank}" },
    "status.level": { en: "LV. {n}", ar: "مستوى {n}" },

    // ---- overview ----
    "overview.eyebrow": { en: "PLAYER STATUS", ar: "حالة اللاعب" },
    "overview.level": { en: "LEVEL", ar: "المستوى" },
    "overview.xpOf": { en: "{exp} / 100 xp", ar: "{exp} / 100 نقطة" },
    "overview.subtitle": { en: "{rank}-Rank · {n} quests cleared", ar: "رتبة {rank} · {n} مهمة مكتملة" },
    "overview.activeQuests": { en: "Active quests", ar: "مهام نشطة" },
    "overview.habits": { en: "Habits", ar: "عادات" },
    "overview.traitsTracked": { en: "Traits tracked", ar: "صفات متتبَّعة" },
    "overview.bankedPoints": { en: "Banked points", ar: "نقاط محفوظة" },
    "overview.radar": { en: "INTELLIGENCE RADAR", ar: "خريطة الذكاءات" },
    "overview.radarAlt": { en: "Intelligence radar chart", ar: "رسم بياني لخريطة الذكاءات" },
    "overview.radarNeedsMore": { en: "Add at least 3 categories to see the radar.", ar: "أضف 3 فئات على الأقل لعرض الخريطة." },
    "overview.recent": { en: "RECENT ACTIVITY", ar: "النشاط الأخير" },
    "overview.viewLog": { en: "View full log →", ar: "عرض السجل كاملًا ←" },
    "overview.noMilestones": { en: "No milestones yet. Clear quests to begin your ascent.", ar: "لا إنجازات بعد. أكمل مهامك لتبدأ صعودك." },

    // ---- intelligence ----
    "intel.eyebrow": { en: "INTELLIGENCE", ar: "الذكاءات" },
    "intel.title": { en: "Categories & traits", ar: "الفئات والصفات" },
    "intel.lv": { en: "Lv {n}", ar: "مستوى {n}" },
    "intel.removeTrait": { en: "Remove trait", ar: "حذف الصفة" },
    "intel.confirmAgain": { en: "Click again to confirm", ar: "اضغط مرة أخرى للتأكيد" },
    "intel.addTrait": { en: "+ add trait", ar: "+ إضافة صفة" },
    "intel.traitName": { en: "Trait name", ar: "اسم الصفة" },
    "intel.arabicOpt": { en: "Arabic (opt.)", ar: "بالعربية (اختياري)" },
    "intel.add": { en: "Add", ar: "إضافة" },
    "intel.investHere": { en: "+1 invest here", ar: "+1 استثمر هنا" },
    "intel.remainder": { en: "Banked fractional progress: {pct}% toward next point", ar: "تقدم جزئي محفوظ: {pct}% نحو النقطة التالية" },
    "intel.addCategory": { en: "Add category", ar: "إضافة فئة" },
    "intel.newCategory": { en: "New intelligence category", ar: "فئة ذكاء جديدة" },
    "intel.name": { en: "Name", ar: "الاسم" },
    "intel.namePlaceholder": { en: "e.g. Financial Intelligence", ar: "مثال: الذكاء المالي" },
    "intel.arabicName": { en: "Arabic name (optional)", ar: "الاسم بالعربية (اختياري)" },
    "intel.shortCode": { en: "Short code", ar: "رمز مختصر" },
    "intel.shortPlaceholder": { en: "e.g. FIN", ar: "مثال: مال" },
    "intel.color": { en: "Color", ar: "اللون" },
    "intel.createCategory": { en: "Create category", ar: "إنشاء الفئة" },
    "intel.nameRequired": { en: "Name is required.", ar: "الاسم مطلوب." },

    // ---- quests & habits ----
    "quests.eyebrow": { en: "QUEST LOG", ar: "سجل المهام" },
    "quests.title": { en: "Your quests", ar: "مهامك" },
    "quests.all": { en: "All", ar: "الكل" },
    "quests.active": { en: "Active", ar: "نشطة" },
    "quests.done": { en: "Done", ar: "مكتملة" },
    "quests.new": { en: "New quest", ar: "مهمة جديدة" },
    "quests.empty": { en: "No active quests. The System awaits your next move.", ar: "لا مهام نشطة. النظام بانتظار خطوتك التالية." },
    "quests.emptyFilter": { en: "Nothing in this filter.", ar: "لا شيء ضمن هذا التصنيف." },
    "habits.eyebrow": { en: "HABITS", ar: "العادات" },
    "habits.title": { en: "Recurring habits", ar: "العادات المتكررة" },
    "habits.new": { en: "New habit", ar: "عادة جديدة" },
    "habits.empty": { en: "No recurring habits yet. Something you do every week belongs here, not in Quests.", ar: "لا عادات متكررة بعد. ما تفعله كل أسبوع مكانه هنا، لا في المهام." },

    // ---- task row ----
    "task.reward": { en: "+{n} xp", ar: "+{n} نقطة" },
    "task.rewardPerRepeat": { en: "+{n} xp/repeat", ar: "+{n} نقطة/مرة" },
    "task.edit": { en: "Edit quest", ar: "تعديل المهمة" },
    "task.delete": { en: "Delete quest", ar: "حذف المهمة" },
    "task.appeal": { en: "Appeal this value", ar: "الاعتراض على هذه القيمة" },
    "task.priority": { en: "Priority", ar: "الأولوية" },
    "task.term": { en: "Term", ar: "المدة" },
    "task.repeats": { en: "Repeats", ar: "التكرار" },
    "task.repeatsPerWeek": { en: "{n}×/week", ar: "{n}× أسبوعيًا" },
    "task.type": { en: "Type", ar: "النوع" },
    "task.recurringHabit": { en: "Recurring habit", ar: "عادة متكررة" },
    "task.complete": { en: "Complete quest", ar: "إكمال المهمة" },
    "task.markIncomplete": { en: "Mark incomplete", ar: "إلغاء الإكمال" },
    "task.decrease": { en: "Decrease 5%", ar: "إنقاص 5%" },
    "task.increase": { en: "Increase 5%", ar: "زيادة 5%" },
    "task.setPct": { en: "Set completion percentage", ar: "تحديد نسبة الإنجاز" },
    "task.weekProgress": { en: "{done} of {total} this week", ar: "{done} من {total} هذا الأسبوع" },
    "task.amountLogged": { en: " · {amount}{unit} logged", ar: " · تم تسجيل {amount}{unit}" },
    "task.undoLast": { en: "Undo last log", ar: "تراجع عن آخر تسجيل" },
    "task.startTimer": { en: "Start timer", ar: "بدء المؤقت" },
    "task.logAmount": { en: "Log {amount}{unit}", ar: "تسجيل {amount}{unit}" },

    // ---- task form ----
    "form.questTitle": { en: "Quest title", ar: "عنوان المهمة" },
    "form.habitName": { en: "Habit name", ar: "اسم العادة" },
    "form.questType": { en: "Quest type:", ar: "نوع المهمة:" },
    "form.oneOff": { en: "One-off", ar: "لمرة واحدة" },
    "form.priorityLong": { en: "Priority — how urgent this is", ar: "الأولوية — مدى إلحاحها" },
    "form.taskTypeLong": { en: "Task type — how long it runs", ar: "نوع المهمة — مدة استمرارها" },
    "form.expMode": { en: "EXP mode:", ar: "طريقة احتساب النقاط:" },
    "form.gradual": { en: "Gradual (scales with %)", ar: "تدريجي (حسب النسبة)" },
    "form.allAtOnce": { en: "All at once (100% only)", ar: "دفعة واحدة (عند 100% فقط)" },
    "form.repeatsPerWeek": { en: "Repeats per week", ar: "مرات التكرار أسبوعيًا" },
    "form.amountPerRepeat": { en: "Amount per repeat", ar: "المقدار لكل مرة" },
    "form.unit": { en: "Unit", ar: "الوحدة" },
    "form.customUnit": { en: "Custom unit (e.g. pushups)", ar: "وحدة مخصصة (مثال: تمرين ضغط)" },
    "form.other": { en: "Other", ar: "أخرى" },
    "form.custom": { en: "Custom…", ar: "مخصص…" },
    "form.describe": { en: "Describe it", ar: "صف المهمة" },
    "form.describePlaceholder": { en: "What does this actually involve?", ar: "ما الذي تتضمنه فعليًا؟" },
    "form.notes": { en: "Notes", ar: "ملاحظات" },
    "form.notesPlaceholder": { en: "Optional notes...", ar: "ملاحظات اختيارية..." },
    "form.systemSetsValue": { en: "The system reviews this and sets its EXP value — you can't set your own.", ar: "النظام يراجعها ويحدد قيمتها بالنقاط — لا يمكنك تحديدها بنفسك." },
    "form.assignedBySystem": { en: "Assigned by the system", ar: "محددة من النظام" },
    "form.general": { en: "General", ar: "عام" },
    "form.accept": { en: "Accept quest", ar: "قبول المهمة" },
    "form.saveChanges": { en: "Save changes", ar: "حفظ التعديلات" },
    "form.evaluating": { en: "Evaluating…", ar: "جارٍ التقييم…" },
    "form.cancel": { en: "Cancel", ar: "إلغاء" },
    "form.needsTitle": { en: "Quest needs a title.", ar: "المهمة تحتاج عنوانًا." },
    "form.needsDescription": { en: "Describe the task in at least a few words so it can be judged fairly.", ar: "صف المهمة بكلمات قليلة على الأقل ليتم تقييمها بإنصاف." },
    "form.signInToAdd": { en: "Sign in to add a task — the system has to set its value.", ar: "سجّل الدخول لإضافة مهمة — النظام هو من يحدد قيمتها." },
    "form.offline": { en: "You're offline. Adding a task needs a connection so the system can evaluate it.", ar: "أنت غير متصل. إضافة مهمة تحتاج اتصالًا ليتمكن النظام من تقييمها." },
    "priority.Low": { en: "Low", ar: "منخفضة" },
    "priority.Medium": { en: "Medium", ar: "متوسطة" },
    "priority.High": { en: "High", ar: "عالية" },
    "term.Short Term": { en: "Short Term", ar: "قصيرة المدى" },
    "term.Medium Term": { en: "Medium Term", ar: "متوسطة المدى" },
    "term.Long Term": { en: "Long Term", ar: "طويلة المدى" },

    // ---- timer ----
    "timer.title": { en: "TIMER", ar: "المؤقت" },
    "timer.start": { en: "Start", ar: "بدء" },
    "timer.resume": { en: "Resume", ar: "متابعة" },
    "timer.pause": { en: "Pause", ar: "إيقاف مؤقت" },
    "timer.stopLog": { en: "Stop & log", ar: "إيقاف وتسجيل" },

    // ---- stats ----
    "stats.eyebrow": { en: "STATISTICS", ar: "الإحصائيات" },
    "stats.title": { en: "Your activity", ar: "نشاطك" },
    "stats.thisWeek": { en: "THIS WEEK", ar: "هذا الأسبوع" },
    "stats.thisMonth": { en: "THIS MONTH", ar: "هذا الشهر" },
    "stats.today": { en: "Today · {date}", ar: "اليوم · {date}" },
    "stats.todayBtn": { en: "Today", ar: "اليوم" },
    "stats.previous": { en: "Previous", ar: "السابق" },
    "stats.next": { en: "Next", ar: "التالي" },
    "stats.daysActive": { en: "{active} of {total} days active", ar: "{active} من {total} يوم نشط" },
    "stats.totalXp": { en: "+{n} xp", ar: "+{n} نقطة" },
    "stats.questsCompleted": { en: "Quests completed", ar: "مهام مكتملة" },
    "stats.repeatsLogged": { en: "Habit repeats logged", ar: "تكرارات مسجَّلة" },

    // ---- log & inbox ----
    "log.eyebrow": { en: "PROGRESSION LOG", ar: "سجل التقدم" },
    "log.title": { en: "Everything that happened", ar: "كل ما حدث" },
    "log.fromSystem": { en: "FROM THE SYSTEM", ar: "من النظام" },
    "log.new": { en: "new", ar: "جديد" },
    "log.expChange": { en: "({sign}{n} EXP)", ar: "({sign}{n} نقطة)" },

    // ---- appeals ----
    "appeal.section": { en: "VALUE APPEALS", ar: "اعتراضات على القيمة" },
    "appeal.appealing": { en: "Appealing: {title}", ar: "اعتراض على: {title}" },
    "appeal.reasonPlaceholder": { en: "Why does this value look wrong?", ar: "لماذا تبدو هذه القيمة غير صحيحة؟" },
    "appeal.submit": { en: "Submit appeal", ar: "إرسال الاعتراض" },
    "appeal.submitting": { en: "Submitting…", ar: "جارٍ الإرسال…" },
    "appeal.needsReason": { en: "Explain why the value looks wrong.", ar: "وضّح لماذا تبدو القيمة غير صحيحة." },
    "appeal.submitted": { en: "Appeal submitted — the system will review it.", ar: "تم إرسال الاعتراض — سيراجعه النظام." },
    "appeal.pending": { en: "Under review", ar: "قيد المراجعة" },
    "appeal.resolved": { en: "Value corrected", ar: "تم تصحيح القيمة" },
    "appeal.rejected": { en: "Value upheld", ar: "تم تثبيت القيمة" },
    "appeal.newValue": { en: " · now {n} xp", ar: " · أصبحت {n} نقطة" },

    // ---- settings ----
    "settings.title": { en: "System settings", ar: "إعدادات النظام" },
    "settings.appearance": { en: "Appearance", ar: "المظهر" },
    "settings.language": { en: "Language", ar: "اللغة" },
    "settings.dark": { en: "DARK", ar: "داكن" },
    "settings.light": { en: "LIGHT", ar: "فاتح" },
    "settings.accent": { en: "Accent", ar: "اللون المميز" },
    "settings.background": { en: "Background", ar: "الخلفية" },
    "settings.derivedHint": { en: "Everything else — text, borders, panels — is derived from these so it stays readable.", ar: "كل ما عدا ذلك — النصوص والحدود واللوحات — يُشتق من هذين اللونين ليبقى مقروءًا." },
    "settings.tuning": { en: "Progression tuning", ar: "ضبط التقدم" },
    "settings.expDivisor": { en: "EXP divisor (Pt ÷ this = EXP — leave at 1 so Pt = EXP)", ar: "مُقسِّم النقاط (النقاط ÷ هذا = الخبرة — اتركه 1 ليتساويا)" },
    "settings.pointsPerLevel": { en: "Skill points per level", ar: "نقاط المهارة لكل مستوى" },
    "settings.save": { en: "Save settings", ar: "حفظ الإعدادات" },
    "settings.backup": { en: "Backup", ar: "النسخ الاحتياطي" },
    "settings.export": { en: "Export JSON", ar: "تصدير JSON" },
    "settings.import": { en: "Import JSON", ar: "استيراد JSON" },
    "settings.backupHint": { en: "Everything lives only in this browser's local storage — export a backup regularly, especially before clearing browser data.", ar: "كل شيء محفوظ في هذا المتصفح فقط — صدّر نسخة احتياطية بانتظام، خاصة قبل مسح بيانات المتصفح." },
    "settings.danger": { en: "Danger zone", ar: "منطقة الخطر" },
    "settings.reset": { en: "Reset to seed data", ar: "إعادة التعيين للبيانات الأصلية" },
    "settings.resetConfirm": { en: "Click again to confirm reset", ar: "اضغط مرة أخرى لتأكيد إعادة التعيين" },
    "settings.close": { en: "Close", ar: "إغلاق" },

    // ---- account ----
    "account.section": { en: "Account & sync", ar: "الحساب والمزامنة" },
    "account.notSetUp": { en: "Cloud sync isn't set up for this copy of the app yet — see README.", ar: "المزامنة السحابية غير مفعّلة في هذه النسخة بعد — راجع ملف README." },
    "account.signedInAs": { en: "Signed in as", ar: "مسجّل الدخول باسم" },
    "account.syncs": { en: "Your progress syncs automatically.", ar: "يتم حفظ تقدمك تلقائيًا." },
    "account.signOut": { en: "Sign out", ar: "تسجيل الخروج" },
    "account.signIn": { en: "SIGN IN", ar: "تسجيل الدخول" },
    "account.createAccount": { en: "CREATE ACCOUNT", ar: "إنشاء حساب" },
    "account.continueGoogle": { en: "Continue with Google", ar: "المتابعة بحساب Google" },
    "account.email": { en: "Email", ar: "البريد الإلكتروني" },
    "account.password": { en: "Password (6+ characters)", ar: "كلمة المرور (6 أحرف فأكثر)" },
    "account.forgot": { en: "Forgot password?", ar: "نسيت كلمة المرور؟" },
    "account.signInBtn": { en: "Sign in", ar: "دخول" },
    "account.createBtn": { en: "Create account", ar: "إنشاء الحساب" },
    "account.wait": { en: "Please wait…", ar: "يرجى الانتظار…" },
    "account.hint": { en: "Lets you pick up the same progress on another device.", ar: "يتيح لك متابعة تقدمك من جهاز آخر." },
    "account.unverified": { en: "Email not verified yet — check your inbox for the link.", ar: "لم يتم تأكيد البريد بعد — تفقّد بريدك للرابط." },
    "account.resend": { en: "Resend email", ar: "إعادة الإرسال" },
    "account.needBoth": { en: "Enter an email and password.", ar: "أدخل البريد الإلكتروني وكلمة المرور." },
    "account.enterEmailFirst": { en: "Enter your email above first, then tap this again.", ar: "أدخل بريدك في الحقل أعلاه أولًا، ثم اضغط هنا مجددًا." },
    "account.resetSent": { en: "Password reset email sent — check your inbox.", ar: "تم إرسال رابط إعادة التعيين — تفقّد بريدك." },
    "account.created": { en: "Account created — check your email to verify it.", ar: "تم إنشاء الحساب — تفقّد بريدك لتأكيده." },
    "account.popupBlocked": { en: "Your browser blocked the popup — allow popups for this site and try again.", ar: "متصفحك حجب النافذة المنبثقة — اسمح بها لهذا الموقع وحاول مجددًا." },

    // ---- sync ----
    "sync.title": { en: "Existing account data found", ar: "توجد بيانات محفوظة في حسابك" },
    "sync.body": { en: "Your account already has progress saved from another device. Which copy do you want to keep? The other one will be overwritten.", ar: "حسابك يحتوي على تقدم محفوظ من جهاز آخر. أي نسخة تريد الاحتفاظ بها؟ سيتم استبدال الأخرى." },
    "sync.useCloud": { en: "Use my account's data (this device gets overwritten)", ar: "استخدم بيانات حسابي (سيتم استبدال بيانات هذا الجهاز)" },
    "sync.useLocal": { en: "Use this device's data (your account gets overwritten)", ar: "استخدم بيانات هذا الجهاز (سيتم استبدال بيانات حسابك)" },
    "sync.synced": { en: "Synced from another device.", ar: "تمت المزامنة من جهاز آخر." },

    // ---- admin ----
    "admin.eyebrow": { en: "ADMIN", ar: "الإدارة" },
    "admin.title": { en: "Look up a user", ar: "البحث عن مستخدم" },
    "admin.emailPlaceholder": { en: "user@example.com", ar: "user@example.com" },
    "admin.search": { en: "Search", ar: "بحث" },
    "admin.searching": { en: "Searching…", ar: "جارٍ البحث…" },
    "admin.enterEmail": { en: "Enter an email.", ar: "أدخل بريدًا إلكترونيًا." },
    "admin.notFound": { en: "No account found with that email.", ar: "لا يوجد حساب بهذا البريد." },
    "admin.syncDirHint": { en: "Can't find someone who signed up before this Admin page existed?", ar: "لا تجد شخصًا سجّل قبل وجود صفحة الإدارة؟" },
    "admin.syncDir": { en: "Sync directory", ar: "تحديث الدليل" },
    "admin.result": { en: "Result", ar: "النتيجة" },
    "admin.rank": { en: "Rank", ar: "الرتبة" },
    "admin.level": { en: "Level", ar: "المستوى" },
    "admin.exp": { en: "EXP", ar: "النقاط" },
    "admin.questsDone": { en: "Quests done", ar: "مهام مكتملة" },
    "admin.noProgress": { en: "No saved progress yet for this account.", ar: "لا يوجد تقدم محفوظ لهذا الحساب بعد." },
    "admin.currently": { en: "Currently: {status}", ar: "الحالة: {status}" },
    "admin.isAdmin": { en: "an admin", ar: "مسؤول" },
    "admin.notAdmin": { en: "not an admin", ar: "ليس مسؤولًا" },
    "admin.makeAdmin": { en: "Make admin", ar: "تعيين كمسؤول" },
    "admin.removeAdmin": { en: "Remove admin", ar: "إزالة الصلاحية" },
    "admin.sendMessage": { en: "Send message / adjust EXP", ar: "إرسال رسالة / تعديل النقاط" },
    "admin.messagePlaceholder": { en: "Message to this user...", ar: "رسالة لهذا المستخدم..." },
    "admin.amountPlaceholder": { en: "EXP amount (optional, can be negative)", ar: "مقدار النقاط (اختياري، يمكن أن يكون سالبًا)" },
    "admin.send": { en: "Send", ar: "إرسال" },
    "admin.sending": { en: "Sending…", ar: "جارٍ الإرسال…" },
    "admin.adjustHint": { en: "Leave the amount blank (or 0) to just send a message with no EXP change. Negative values apply a penalty.", ar: "اترك المقدار فارغًا (أو 0) لإرسال رسالة دون تغيير النقاط. القيم السالبة تطبّق عقوبة." },
    "admin.needMessage": { en: "Write a message first.", ar: "اكتب رسالة أولًا." },
    "admin.appealQueue": { en: "VALUE APPEALS", ar: "اعتراضات على القيمة" },
    "admin.refresh": { en: "Refresh", ar: "تحديث" },
    "admin.nothingPending": { en: "Nothing pending.", ar: "لا شيء معلّق." },
    "admin.current": { en: "Current", ar: "الحالية" },
    "admin.kind": { en: "Kind", ar: "النوع" },
    "admin.theirReason": { en: "Their reason:", ar: "سببه:" },
    "admin.from": { en: "from {uid}", ar: "من {uid}" },
    "admin.correctedXp": { en: "Corrected xp", ar: "القيمة المصححة" },
    "admin.correctValue": { en: "Correct value", ar: "تصحيح القيمة" },
    "admin.uphold": { en: "Uphold", ar: "تثبيت" },
    "admin.needValue": { en: "Enter the corrected value first.", ar: "أدخل القيمة المصححة أولًا." },
    "admin.quest": { en: "quest", ar: "مهمة" },
    "admin.habit": { en: "habit", ar: "عادة" },

    // ---- notifications ----
    "notif.levelup": { en: "LEVEL UP", ar: "ترقية مستوى" },
    "notif.skillpoint": { en: "STAT INVESTED", ar: "تم استثمار نقطة" },
    "notif.info": { en: "SYSTEM", ar: "النظام" },
    "notif.expLoss": { en: "PROGRESS ADJUSTED", ar: "تم تعديل التقدم" },
    "notif.delevel": { en: "LEVEL REVERTED", ar: "تراجع المستوى" },
    "notif.rankdown": { en: "RANK DOWN", ar: "انخفاض الرتبة" },
    "notif.exp": { en: "QUEST PROGRESS", ar: "تقدم المهمة" },
    "rankup.notice": { en: "System notice", ar: "إشعار من النظام" },
    "rankup.dismiss": { en: "click anywhere to continue", ar: "اضغط في أي مكان للمتابعة" },
    "rankup.aria": { en: "Rank up", ar: "ترقية رتبة" },


    // ---- units (display only — the stored value stays the English key, so
    // switching language never rewrites saved task data) ----
    "unitGroup.Count": { en: "Count", ar: "عدد" },
    "unitGroup.Time": { en: "Time", ar: "وقت" },
    "unitGroup.Volume": { en: "Volume", ar: "حجم" },
    "unitGroup.Distance": { en: "Distance", ar: "مسافة" },
    "unitGroup.Weight": { en: "Weight", ar: "وزن" },
    "unit.reps": { en: "reps", ar: "تكرار" },
    "unit.times": { en: "times", ar: "مرة" },
    "unit.pages": { en: "pages", ar: "صفحة" },
    "unit.steps": { en: "steps", ar: "خطوة" },
    "unit.sets": { en: "sets", ar: "مجموعة" },
    "unit.sec": { en: "sec", ar: "ثانية" },
    "unit.min": { en: "min", ar: "دقيقة" },
    "unit.hr": { en: "hr", ar: "ساعة" },
    "unit.ml": { en: "ml", ar: "مل" },
    "unit.L": { en: "L", ar: "لتر" },
    "unit.m": { en: "m", ar: "م" },
    "unit.km": { en: "km", ar: "كم" },
    "unit.g": { en: "g", ar: "غم" },
    "unit.kg": { en: "kg", ar: "كغم" },

    // ---- misc ----
    "common.backupDownloaded": { en: "Backup downloaded.", ar: "تم تنزيل النسخة الاحتياطية." },
    "common.backupImported": { en: "Backup imported successfully.", ar: "تم استيراد النسخة الاحتياطية بنجاح." },
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
