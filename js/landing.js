// The landing page: what a first-time visitor sees before the app.
//
// Shown on a device that has never held an account and has not been past
// it before (main.js decides). Outside the app the rule against explaining
// prose does not apply: this page is where the app explains itself, once,
// with the real artwork it earns.
(function (SYS) {
  "use strict";

  const L = {
    en: {
      d1: "Read a 300-page novel",
      d2: "Finish an online SQL course",
      d3: "Train for a 10 km race",
      d4: "Run 5 km",
      d5: "Read 20 pages",
      d6: "Drink 2 L of water",
      d7: "Meditate 10 minutes",
      ranksTitle: "Ranks from G to S",
      insideTitle: "See it inside",
      signIn: "Sign in",
      start: "Start free",
      heroTitle: "Level up your real life.",
      heroSub: "The System turns your goals and habits into an RPG. An AI values every task by the real effort it takes, so every level and every rank you reach is earned.",
      heroNote: "Free. No card. Works on phone and desktop.",
      featuresTitle: "Everything a hunter needs",
      f1t: "An AI that can't be fooled",
      f1b: "Write what you will do and the AI prices it by the effort it really takes. Nobody hands themselves points, so the ranking means something.",
      f2t: "Ranks from G to S",
      f2b: "Every EXP moves your level. Every hundred levels, a new rank, with its own emblem. The climb to S takes real work.",
      f3t: "Eight intelligences",
      f3b: "An opening assessment maps where you stand, and every task grows the side of you it actually trains.",
      f4t: "Streaks that keep you going",
      f4b: "Do one thing a day to keep your streak. Miss a day and a freeze can save it. At eight in the evening, a reminder if it's about to end.",
      f5t: "Seasons and rankings",
      f5b: "Climb the world board and the season board, race your friends one on one every week, and finish a season with exclusive rewards.",
      f6t: "Make it yours",
      f6b: "Earn gold from your work and spend it on themes. Animated frames show your profile off.",
      stepsTitle: "How it works",
      s1t: "Add a quest or a habit",
      s1b: "Reading a book, training, studying: anything that makes you better.",
      s2t: "The AI values it",
      s2b: "A fair price in EXP, from the real effort, the same for everyone.",
      s3t: "Do it, and level up",
      s3b: "EXP, gold, a longer streak, and a step closer to the next rank.",
      ctaTitle: "The System is waiting.",
      ctaSub: "Start with forty short questions that map where you stand today.",
      exampleTask: "Read a 300-page novel",
      streakDays: "12 days",
      footer: "The System",
    },
    ar: {
      d1: "قراءة رواية من 300 صفحة",
      d2: "إنهاء دورة SQL عبر الإنترنت",
      d3: "التدرّب لسباق 10 كم",
      d4: "الجري 5 كم",
      d5: "قراءة 20 صفحة",
      d6: "شرب 2 لتر ماء",
      d7: "تأمّل 10 دقائق",
      ranksTitle: "رتب من G إلى S",
      insideTitle: "شاهده من الداخل",
      signIn: "تسجيل الدخول",
      start: "ابدأ مجانًا",
      heroTitle: "ارتقِ بحياتك الحقيقية.",
      heroSub: "يحوّل The System أهدافك وعاداتك إلى لعبة تقمّص أدوار. يقيّم الذكاء الاصطناعي كل مهمة بحسب الجهد الحقيقي الذي تتطلبه، فكل مستوى وكل رتبة تصل إليها تكون مستحقة.",
      heroNote: "مجاني. بلا بطاقة. يعمل على الهاتف والحاسوب.",
      featuresTitle: "كل ما يحتاجه الصيّاد",
      f1t: "ذكاء اصطناعي لا يُخدع",
      f1b: "اكتب ما ستفعله ويقيّمه الذكاء الاصطناعي بحسب الجهد الفعلي. لا أحد يمنح نفسه نقاطًا، لذلك للترتيب معنى حقيقي.",
      f2t: "رتب من G إلى S",
      f2b: "كل نقطة خبرة تقرّبك من المستوى التالي، وكل مئة مستوى رتبة جديدة بشعارها الخاص. الوصول إلى S يحتاج عملًا حقيقيًا.",
      f3t: "ثمانية أنواع من الذكاء",
      f3b: "تقييم أوّلي يحدّد نقطة انطلاقك، وكل مهمة تنمّي الجانب الذي تدرّبه فيك فعلًا.",
      f4t: "سلاسل تُبقيك مستمرًا",
      f4b: "أنجز شيئًا واحدًا يوميًا لتحافظ على سلسلتك. وإن فاتك يوم فالتجميد ينقذها، وفي الثامنة مساءً تصلك رسالة تذكير قبل أن تنقطع.",
      f5t: "مواسم وتصنيفات",
      f5b: "تصدّر الترتيب العالمي وترتيب الموسم، وتسابق مع أصدقائك كل أسبوع، واختم الموسم بجوائز حصرية.",
      f6t: "اجعله لك",
      f6b: "اجمع الذهب من إنجازاتك واشترِ به الثيمات، وزيّن ملفك الشخصي بإطارات متحركة.",
      stepsTitle: "كيف يعمل",
      s1t: "أضف مهمة أو عادة",
      s1b: "قراءة كتاب، تمرين، دراسة: أي شيء يجعلك أفضل.",
      s2t: "يقيّمها الذكاء الاصطناعي",
      s2b: "قيمة عادلة بنقاط الخبرة، بحسب الجهد الحقيقي، وبالمعيار نفسه للجميع.",
      s3t: "أنجزها وارتقِ",
      s3b: "خبرة وذهب وسلسلة أطول، وخطوة أقرب إلى الرتبة التالية.",
      ctaTitle: "النظام ينتظرك.",
      ctaSub: "ابدأ بأربعين سؤالًا قصيرًا تحدّد أين تقف اليوم.",
      exampleTask: "قراءة رواية من 300 صفحة",
      streakDays: "12 يومًا",
      footer: "The System",
    },
    es: {
      d1: "Leer una novela de 300 páginas",
      d2: "Terminar un curso de SQL en línea",
      d3: "Entrenar para una carrera de 10 km",
      d4: "Correr 5 km",
      d5: "Leer 20 páginas",
      d6: "Beber 2 L de agua",
      d7: "Meditar 10 minutos",
      ranksTitle: "Rangos de G a S",
      insideTitle: "Míralo por dentro",
      signIn: "Iniciar sesión",
      start: "Empieza gratis",
      heroTitle: "Sube de nivel en la vida real.",
      heroSub: "The System convierte tus metas y hábitos en un RPG. Una IA valora cada tarea según el esfuerzo real que exige, así que cada nivel y cada rango que alcanzas es merecido.",
      heroNote: "Gratis. Sin tarjeta. En el móvil y en el ordenador.",
      featuresTitle: "Todo lo que necesita un cazador",
      f1t: "Una IA que no se deja engañar",
      f1b: "Escribe lo que harás y la IA lo valora por el esfuerzo real. Nadie se regala puntos, así que la clasificación tiene sentido.",
      f2t: "Rangos de G a S",
      f2b: "Cada punto de EXP sube tu nivel; cada cien niveles, un rango nuevo con su emblema. Llegar a S exige trabajo de verdad.",
      f3t: "Ocho inteligencias",
      f3b: "Una evaluación inicial marca tu punto de partida, y cada tarea hace crecer la parte de ti que de verdad entrena.",
      f4t: "Rachas que te mantienen",
      f4b: "Haz una cosa al día para mantener tu racha. Si fallas un día, una congelación la salva. A las ocho de la tarde, un aviso si está por acabarse.",
      f5t: "Temporadas y clasificaciones",
      f5b: "Sube en la clasificación mundial y en la de temporada, compite cada semana uno contra uno con tus amigos y termina la temporada con recompensas exclusivas.",
      f6t: "Hazlo tuyo",
      f6b: "Gana oro con tu trabajo y gástalo en temas. Los marcos animados hacen lucir tu perfil.",
      stepsTitle: "Cómo funciona",
      s1t: "Añade una misión o un hábito",
      s1b: "Leer un libro, entrenar, estudiar: todo lo que te haga mejor.",
      s2t: "La IA lo valora",
      s2b: "Un precio justo en EXP, por el esfuerzo real, igual para todos.",
      s3t: "Hazlo y sube de nivel",
      s3b: "EXP, oro, una racha más larga y un paso más cerca del siguiente rango.",
      ctaTitle: "The System te espera.",
      ctaSub: "Empieza con cuarenta preguntas cortas que marcan dónde estás hoy.",
      exampleTask: "Leer una novela de 300 páginas",
      streakDays: "12 días",
      footer: "The System",
    },
    fr: {
      d1: "Lire un roman de 300 pages",
      d2: "Terminer un cours de SQL en ligne",
      d3: "Préparer une course de 10 km",
      d4: "Courir 5 km",
      d5: "Lire 20 pages",
      d6: "Boire 2 L d\u2019eau",
      d7: "Méditer 10 minutes",
      ranksTitle: "Des rangs de G à S",
      insideTitle: "Voyez l\u2019intérieur",
      signIn: "Se connecter",
      start: "Commencer gratuitement",
      heroTitle: "Montez de niveau dans la vraie vie.",
      heroSub: "The System transforme vos objectifs et vos habitudes en RPG. Une IA évalue chaque tâche selon l’effort réel qu’elle demande : chaque niveau et chaque rang que vous atteignez est mérité.",
      heroNote: "Gratuit. Sans carte. Sur mobile et ordinateur.",
      featuresTitle: "Tout ce qu’il faut à un chasseur",
      f1t: "Une IA qu’on ne trompe pas",
      f1b: "Écrivez ce que vous allez faire et l’IA l’évalue selon l’effort réel. Personne ne s’offre de points : le classement a du sens.",
      f2t: "Des rangs de G à S",
      f2b: "Chaque EXP fait monter votre niveau ; tous les cent niveaux, un nouveau rang et son emblème. Atteindre S demande un vrai travail.",
      f3t: "Huit intelligences",
      f3b: "Une évaluation initiale situe votre point de départ, et chaque tâche fait grandir la part de vous qu’elle entraîne vraiment.",
      f4t: "Des séries qui vous tiennent",
      f4b: "Faites une chose par jour pour garder votre série. Un jour manqué ? Un gel la sauve. À vingt heures, un rappel si elle va s’arrêter.",
      f5t: "Saisons et classements",
      f5b: "Grimpez au classement mondial et à celui de la saison, affrontez vos amis en duel chaque semaine et finissez la saison avec des récompenses exclusives.",
      f6t: "À votre image",
      f6b: "Gagnez de l’or par votre travail et dépensez-le en thèmes. Les cadres animés mettent votre profil en valeur.",
      stepsTitle: "Comment ça marche",
      s1t: "Ajoutez une quête ou une habitude",
      s1b: "Lire un livre, s’entraîner, étudier : tout ce qui vous fait progresser.",
      s2t: "L’IA l’évalue",
      s2b: "Un prix juste en EXP, selon l’effort réel, le même pour tous.",
      s3t: "Faites-la et montez de niveau",
      s3b: "De l’EXP, de l’or, une série plus longue et un pas de plus vers le rang suivant.",
      ctaTitle: "The System vous attend.",
      ctaSub: "Commencez par quarante questions courtes qui situent où vous en êtes.",
      exampleTask: "Lire un roman de 300 pages",
      streakDays: "12 jours",
      footer: "The System",
    },
    de: {
      d1: "Einen 300-Seiten-Roman lesen",
      d2: "Einen Online-SQL-Kurs abschließen",
      d3: "Für einen 10-km-Lauf trainieren",
      d4: "5 km laufen",
      d5: "20 Seiten lesen",
      d6: "2 L Wasser trinken",
      d7: "10 Minuten meditieren",
      ranksTitle: "Ränge von G bis S",
      insideTitle: "So sieht es aus",
      signIn: "Anmelden",
      start: "Kostenlos starten",
      heroTitle: "Level up im echten Leben.",
      heroSub: "The System macht aus deinen Zielen und Gewohnheiten ein RPG. Eine KI bewertet jede Aufgabe nach dem echten Aufwand – jedes Level und jeder Rang, den du erreichst, ist verdient.",
      heroNote: "Kostenlos. Ohne Karte. Auf Handy und Computer.",
      featuresTitle: "Alles, was ein Jäger braucht",
      f1t: "Eine KI, die man nicht austrickst",
      f1b: "Schreib auf, was du tun wirst, und die KI bewertet es nach dem echten Aufwand. Niemand vergibt sich selbst Punkte – die Rangliste bedeutet etwas.",
      f2t: "Ränge von G bis S",
      f2b: "Jede EXP hebt dein Level, alle hundert Level ein neuer Rang mit eigenem Emblem. Der Weg zu S braucht echte Arbeit.",
      f3t: "Acht Intelligenzen",
      f3b: "Ein Einstiegstest zeigt, wo du stehst, und jede Aufgabe stärkt die Seite an dir, die sie wirklich trainiert.",
      f4t: "Serien, die dich dranbleiben lassen",
      f4b: "Eine Sache pro Tag hält deine Serie. Einen Tag verpasst? Ein Freeze rettet sie. Um acht Uhr abends eine Erinnerung, bevor sie reißt.",
      f5t: "Saisons und Ranglisten",
      f5b: "Steig in der Welt- und Saisonrangliste auf, tritt jede Woche eins gegen eins gegen Freunde an und beende die Saison mit exklusiven Belohnungen.",
      f6t: "Mach es zu deinem",
      f6b: "Verdiene Gold mit deiner Arbeit und gib es für Themes aus. Animierte Rahmen schmücken dein Profil.",
      stepsTitle: "So funktioniert es",
      s1t: "Füge eine Quest oder Gewohnheit hinzu",
      s1b: "Ein Buch lesen, trainieren, lernen: alles, was dich besser macht.",
      s2t: "Die KI bewertet sie",
      s2b: "Ein fairer Preis in EXP, nach echtem Aufwand, gleich für alle.",
      s3t: "Erledige sie und steig auf",
      s3b: "EXP, Gold, eine längere Serie und ein Schritt näher zum nächsten Rang.",
      ctaTitle: "The System wartet auf dich.",
      ctaSub: "Starte mit vierzig kurzen Fragen, die zeigen, wo du heute stehst.",
      exampleTask: "Einen 300-Seiten-Roman lesen",
      streakDays: "12 Tage",
      footer: "The System",
    },
    ja: {
      d1: "300ページの小説を読む",
      d2: "オンラインSQL講座を修了",
      d3: "10kmレースに向けて練習",
      d4: "5km走る",
      d5: "20ページ読む",
      d6: "水を2L飲む",
      d7: "10分瞑想",
      ranksTitle: "GからSまでのランク",
      insideTitle: "中身を見る",
      signIn: "ログイン",
      start: "無料で始める",
      heroTitle: "現実の人生をレベルアップ。",
      heroSub: "The Systemは目標と習慣をRPGに変えます。AIがすべてのタスクを実際の労力で評価するので、到達するレベルもランクもすべて本物です。",
      heroNote: "無料。カード不要。スマホでもPCでも。",
      featuresTitle: "ハンターに必要なすべて",
      f1t: "ごまかせないAI",
      f1b: "やることを書けば、AIが実際の労力で評価します。誰も自分にポイントを与えられないから、ランキングに意味があります。",
      f2t: "GからSまでのランク",
      f2b: "EXPごとにレベルが上がり、100レベルごとに専用エンブレムの新ランク。Sへの道は本当の努力が必要です。",
      f3t: "8つの知能",
      f3b: "最初の診断で現在地を把握し、タスクごとに実際に鍛えている面が伸びていきます。",
      f4t: "続けられる連続記録",
      f4b: "1日1つで連続記録を維持。休んだ日はフリーズが守ります。途切れそうな日は夜8時にお知らせ。",
      f5t: "シーズンとランキング",
      f5b: "世界ランキングとシーズンランキングを駆け上がり、毎週友だちと1対1で競い、シーズン限定の報酬を手に入れよう。",
      f6t: "自分らしく",
      f6b: "努力でゴールドを稼ぎ、テーマに使おう。動くフレームがプロフィールを彩ります。",
      stepsTitle: "使い方",
      s1t: "クエストや習慣を追加",
      s1b: "読書、トレーニング、勉強。成長につながることなら何でも。",
      s2t: "AIが評価",
      s2b: "実際の労力に基づく、誰にとっても同じ公平なEXP。",
      s3t: "達成してレベルアップ",
      s3b: "EXPとゴールド、伸びる連続記録、そして次のランクへ一歩前進。",
      ctaTitle: "The Systemが待っています。",
      ctaSub: "今の自分を知る40の短い質問から始めましょう。",
      exampleTask: "300ページの小説を読む",
      streakDays: "12日",
      footer: "The System",
    },
    zh: {
      d1: "读一本300页的小说",
      d2: "完成在线SQL课程",
      d3: "为10公里跑训练",
      d4: "跑5公里",
      d5: "读20页",
      d6: "喝2升水",
      d7: "冥想10分钟",
      ranksTitle: "从 G 到 S 的段位",
      insideTitle: "看看里面",
      signIn: "登录",
      start: "免费开始",
      heroTitle: "让真实人生升级。",
      heroSub: "The System 把你的目标和习惯变成一款RPG。AI 按真实付出评估每项任务，所以你达到的每一级、每个段位都是挣来的。",
      heroNote: "免费。无需银行卡。手机和电脑都能用。",
      featuresTitle: "猎人所需的一切",
      f1t: "骗不过的 AI",
      f1b: "写下你要做的事，AI 按真实付出给出分值。没人能给自己加分，排行榜才有意义。",
      f2t: "从 G 到 S 的段位",
      f2b: "每点经验都在提升等级，每一百级迎来带专属徽章的新段位。登上 S 需要真正的努力。",
      f3t: "八种智能",
      f3b: "初始测评确定你的起点，每项任务都让你真正锻炼的那一面成长。",
      f4t: "让你坚持的连续记录",
      f4b: "每天做一件事就能保持记录。错过一天，冻结帮你保住。快要中断时，晚上八点提醒你。",
      f5t: "赛季与排行榜",
      f5b: "冲上世界榜和赛季榜，每周与好友一对一比拼，赛季结束赢得限定奖励。",
      f6t: "打造你的风格",
      f6b: "用努力赚取金币，兑换主题。动态头像框让你的主页更出彩。",
      stepsTitle: "如何使用",
      s1t: "添加任务或习惯",
      s1b: "读书、训练、学习：任何让你变得更好的事。",
      s2t: "AI 评估分值",
      s2b: "按真实付出给出公平的经验值，人人相同。",
      s3t: "完成并升级",
      s3b: "经验、金币、更长的连续记录，离下一个段位更近一步。",
      ctaTitle: "The System 正在等你。",
      ctaSub: "先回答四十个简短问题，了解你今天的起点。",
      exampleTask: "读一本300页的小说",
      streakDays: "12天",
      footer: "The System",
    },
  };
  SYS.LANDING_STRINGS = L;

  function s(key) {
    const lang = SYS.currentLanguage ? SYS.currentLanguage() : "en";
    return (L[lang] && L[lang][key]) || L.en[key] || key;
  }
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // An account as it might look a few weeks in, drawn with the app's own
  // pages so the landing shows the real thing, in the visitor's language.
  function demoState() {
    const st = SYS.defaultState();
    st.tasks = [];
    st.settings.language = SYS.currentLanguage();
    const base = { priority: "Medium", mode: "simple", notes: "", unit: "times", targetAmount: 1 };
    const quest = (title, pt, cat, trait, completion, id, term) => {
      SYS.addTask(st, Object.assign({}, base, { title, taskType: term, recurring: false, pt, types: [cat],
        traitTargets: [{ category: cat, trait }], priceId: id }));
      const t = st.tasks[st.tasks.length - 1];
      t.completion = completion;
      // Its questions already answered, so nothing shows as held back.
      t.reflections = {};
      (SYS.REFLECTION_CHECKPOINTS || [50, 100]).forEach((cp) => { t.reflections[cp] = { status: "accepted" }; });
      return t;
    };
    const habit = (title, pt, cat, trait, schedule, days, id) => {
      SYS.addTask(st, Object.assign({}, base, { title, taskType: "Recurring", recurring: true, pt, types: [cat],
        traitTargets: [{ category: cat, trait }], schedule, priceId: id }));
      const t = st.tasks[st.tasks.length - 1];
      t.createdAt = Date.now() - 30 * 86400000;
      const today = SYS.todayKey();
      days.forEach((d) => { try { SYS.logHabitDay(st, t.id, SYS.shiftDay(today, -d)); } catch (e) {} });
      return t;
    };
    quest(s("d1"), 360, "linguistic", "Reading", 60, "dq1", "Short Term");
    quest(s("d2"), 600, "logical", "Programming", 35, "dq2", "Medium Term");
    quest(s("d3"), 420, "bodily", "Sports", 80, "dq3", "Long Term");
    habit(s("d4"), 40, "bodily", "Daily exercise", { type: "perWeek", n: 3 }, [1, 3, 5, 8, 10], "dh1");
    habit(s("d5"), 30, "linguistic", "Reading", { type: "daily" }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "dh2");
    habit(s("d6"), 20, "bodily", "Health", { type: "daily" }, [0, 1, 2, 3, 5, 6, 7], "dh3");
    habit(s("d7"), 25, "self", "Reflection & thinking", { type: "daily" }, [1, 2, 4, 5], "dh4");
    // A standing and a picture across the eight intelligences.
    st.player = Object.assign({}, st.player, { rank: "E", level: 37, exp: 80, name: "adam.m" });
    st.assessment = { takenAt: Date.now(), answers: {}, granted: {}, neverTried: [] };
    const lv = { linguistic: 9, logical: 7, visual: 4, bodily: 8, musical: 2, social: 5, self: 6, natural: 3 };
    Object.keys(st.intelligences || {}).forEach((k) => {
      (st.intelligences[k].traits || []).forEach((tr, i) => { tr.level = Math.max(0, (lv[k] || 3) - i); });
    });
    return st;
  }

  function demoUi(page) {
    const ui = Object.assign(SYS.freshUi ? SYS.freshUi() : {}, { page, cloudUser: { uid: "me" }, nameClaimed: true });
    if (page === "leaderboard") {
      const names = ["nova_rise", "adam.m", "Yusuf.K", "mira22", "LeoGrinds", "sara_reads"];
      const totals = [41200, 38750, 33100, 28400, 21900, 17600];
      ui.lbMode = "total";
      ui.leaderboard = names.map((n, i) => {
        const st = SYS.expToStanding(totals[i]);
        return { uid: i === 1 ? "me" : "u" + i, displayName: n, totalExp: totals[i], rank: st.rank, level: st.level };
      });
      ui.leaderboardMine = ui.leaderboard[1];
    }
    if (page === "shop") {
      ui.wallet = { gold: 18250, aurenite: 0, themes: [], frames: [], freezes: 1 };
      ui.shopTab = "themes";
    }
    return ui;
  }

  // One real page of the app, at desktop width, scaled into a window.
  function shot(page) {
    let html = "";
    try { html = SYS.renderPage(demoState(), demoUi(page)); } catch (e) { html = ""; }
    return `
      <div class="ld-window" aria-hidden="true">
        <div class="ld-window-bar"><span></span><span></span><span></span></div>
        <div class="ld-shot"><div class="ld-shot-inner page" inert>${html}</div></div>
      </div>`;
  }

  // Fits each window's page to the window's width.
  function fitShots(root) {
    (root || document).querySelectorAll(".ld-shot").forEach((box) => {
      const inner = box.firstElementChild;
      const k = Math.min(1, box.clientWidth / 720);
      inner.style.transform = "scale(" + k + ")";
    });
  }
  SYS.fitLandingShots = fitShots;

  function renderLanding() {
    const langs = Object.keys(SYS.LANGUAGES || {}).map((code) =>
      `<option value="${code}" ${SYS.currentLanguage() === code ? "selected" : ""}>${esc(SYS.LANGUAGES[code].name)}</option>`).join("");
    const ranks = ["G", "F", "E", "D", "C", "B", "A", "S"];
    const intel = ["linguistic", "logical", "visual", "bodily", "musical", "social", "self", "natural"];
    const feature = (n, art) => `
      <article class="ld-feature">
        <div class="ld-feature-art">${art}</div>
        <h3>${esc(s("f" + n + "t"))}</h3>
        <p>${esc(s("f" + n + "b"))}</p>
      </article>`;
    const coin = `<span class="coin coin-lg" aria-hidden="true"></span>`;
    return `
      <div class="landing" role="main">
        <header class="ld-nav">
          <div class="ld-brand"><img src="icons/mark-on-dark.png" alt="" width="34" height="30" /><span>THE <b>SYSTEM</b></span></div>
          <div class="ld-nav-right">
            <select class="field-select ld-lang" data-action="landing-language" aria-label="Language">${langs}</select>
            <button class="btn btn-outline" data-action="landing-signin">${esc(s("signIn"))}</button>
          </div>
        </header>

        <section class="ld-hero">
          <div class="ld-hero-text">
            <h1>${esc(s("heroTitle"))}</h1>
            <p class="ld-lead">${esc(s("heroSub"))}</p>
            <div class="ld-cta-row">
              <button class="btn btn-primary ld-cta" data-action="landing-start">${esc(s("start"))}</button>
              <button class="link-btn" data-action="landing-signin">${esc(s("signIn"))}</button>
            </div>
            <div class="ld-note">${esc(s("heroNote"))}</div>
          </div>
          <div class="ld-hero-visual" aria-hidden="true">
            <div class="ld-hero-frame">
              <img class="ld-hero-face" src="assets/avatars/a03.jpg" alt="" />
              <canvas class="ld-hero-ring" data-frame="hud" width="1" height="1"></canvas>
            </div>
          </div>
        </section>

        <h2 class="ld-ranks-title">${esc(s("ranksTitle"))}</h2>
        <section class="ld-ranks" aria-hidden="true">
          ${ranks.map((r) => `<img src="assets/ranks/${r}-128.png" alt="" height="${r === "S" ? 84 : 52 + ranks.indexOf(r) * 3}" loading="lazy" />`).join("")}
        </section>

        <section class="ld-section">
          <h2>${esc(s("featuresTitle"))}</h2>
          ${[[1, "quests"], [4, "habits"], [3, "intelligence"], [5, "leaderboard"], [6, "shop"]].map(([n, page], k) => `
          <div class="ld-row ${k % 2 ? "flip" : ""}">
            <div class="ld-row-text">
              <h3>${esc(s("f" + n + "t"))}</h3>
              <p>${esc(s("f" + n + "b"))}</p>
            </div>
            ${shot(page)}
          </div>`).join("")}
        </section>

        <section class="ld-section">
          <h2>${esc(s("stepsTitle"))}</h2>
          <ol class="ld-steps">
            ${[1, 2, 3].map((n) => `<li><span class="ld-step-n">${n}</span><div><h3>${esc(s("s" + n + "t"))}</h3><p>${esc(s("s" + n + "b"))}</p></div></li>`).join("")}
          </ol>
        </section>

        <section class="ld-final">
          <h2>${esc(s("ctaTitle"))}</h2>
          <p>${esc(s("ctaSub"))}</p>
          <button class="btn btn-primary ld-cta" data-action="landing-start">${esc(s("start"))}</button>
        </section>

        <footer class="ld-footer">© ${new Date().getFullYear()} ${esc(s("footer"))}</footer>
      </div>`;
  }

  SYS.renderLanding = renderLanding;
})(window.SYS = window.SYS || {});
