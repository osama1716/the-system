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
      f5b: "Climb the world board and the season board, race your friends one on one every week, and finish a season with its exclusive frame.",
      f6t: "Make it yours",
      f6b: "Earn gold from your work and spend it on themes. Animated frames show your profile off.",
      stepsTitle: "How it works",
      s1t: "Add a quest or a habit",
      s1b: "Reading a book, training, studying: anything that makes you better.",
      s2t: "The AI values it",
      s2b: "A fair price in EXP, from the real effort, the same for everyone.",
      s3t: "Do it, and level up",
      s3b: "EXP, gold, a longer streak, and a step closer to the next rank.",
      ctaTitle: "Your System is waiting.",
      ctaSub: "Start with forty short questions that map where you stand today.",
      exampleTask: "Read a 300-page novel",
      streakDays: "12 days",
      footer: "The System",
    },
    ar: {
      signIn: "تسجيل الدخول",
      start: "ابدأ مجانًا",
      heroTitle: "ارتقِ بحياتك الحقيقية.",
      heroSub: "يحوّل The System أهدافك وعاداتك إلى لعبة تقمّص أدوار. يقيّم الذكاء الاصطناعي كل مهمة بحسب الجهد الحقيقي الذي تتطلبه، فكل مستوى وكل رتبة تصل إليها تكون مستحقة.",
      heroNote: "مجاني. بلا بطاقة. يعمل على الهاتف والحاسوب.",
      featuresTitle: "كل ما يحتاجه الصيّاد",
      f1t: "ذكاء اصطناعي لا يُخدع",
      f1b: "اكتب ما ستفعله ويقيّمه الذكاء الاصطناعي بحسب الجهد الفعلي. لا أحد يمنح نفسه نقاطًا، لذلك للترتيب معنى حقيقي.",
      f2t: "رتب من G إلى S",
      f2b: "كل نقطة خبرة ترفع مستواك، وكل مئة مستوى رتبة جديدة بشعارها الخاص. الوصول إلى S يحتاج عملًا حقيقيًا.",
      f3t: "ثمانية أنواع من الذكاء",
      f3b: "تقييم أوّلي يحدّد نقطة انطلاقك، وكل مهمة تنمّي الجانب الذي تدرّبه فعلًا.",
      f4t: "سلاسل تُبقيك مستمرًا",
      f4b: "أنجز شيئًا واحدًا يوميًا لتحافظ على سلسلتك. إن فاتك يوم فالتجميد ينقذها، وفي الثامنة مساءً يذكّرك قبل أن تنقطع.",
      f5t: "مواسم وتصنيفات",
      f5b: "تصدّر الترتيب العالمي وترتيب الموسم، وتسابق أصدقاءك كل أسبوع، واختم الموسم بإطاره الحصري.",
      f6t: "اجعله لك",
      f6b: "اجمع الذهب من عملك واشترِ به الثيمات، والإطارات المتحركة تزيّن ملفك الشخصي.",
      stepsTitle: "كيف يعمل",
      s1t: "أضف مهمة أو عادة",
      s1b: "قراءة كتاب، تمرين، دراسة: أي شيء يجعلك أفضل.",
      s2t: "يقيّمها الذكاء الاصطناعي",
      s2b: "قيمة عادلة بنقاط الخبرة، من الجهد الحقيقي، ومتساوية للجميع.",
      s3t: "أنجزها وارتقِ",
      s3b: "خبرة وذهب وسلسلة أطول، وخطوة أقرب إلى الرتبة التالية.",
      ctaTitle: "نظامك ينتظرك.",
      ctaSub: "ابدأ بأربعين سؤالًا قصيرًا تحدّد أين تقف اليوم.",
      exampleTask: "قراءة رواية من 300 صفحة",
      streakDays: "12 يومًا",
      footer: "The System",
    },
    es: {
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
      f5b: "Sube en la clasificación mundial y en la de temporada, compite cada semana con tus amigos y termina la temporada con su marco exclusivo.",
      f6t: "Hazlo tuyo",
      f6b: "Gana oro con tu trabajo y gástalo en temas. Los marcos animados lucen tu perfil.",
      stepsTitle: "Cómo funciona",
      s1t: "Añade una misión o un hábito",
      s1b: "Leer un libro, entrenar, estudiar: todo lo que te haga mejor.",
      s2t: "La IA lo valora",
      s2b: "Un precio justo en EXP, por el esfuerzo real, igual para todos.",
      s3t: "Hazlo y sube de nivel",
      s3b: "EXP, oro, una racha más larga y un paso más cerca del siguiente rango.",
      ctaTitle: "Tu System te espera.",
      ctaSub: "Empieza con cuarenta preguntas cortas que marcan dónde estás hoy.",
      exampleTask: "Leer una novela de 300 páginas",
      streakDays: "12 días",
      footer: "The System",
    },
    fr: {
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
      f3b: "Une évaluation de départ situe votre point de départ, et chaque tâche fait grandir la part de vous qu’elle entraîne vraiment.",
      f4t: "Des séries qui vous tiennent",
      f4b: "Faites une chose par jour pour garder votre série. Un jour manqué ? Un gel la sauve. À vingt heures, un rappel si elle va s’arrêter.",
      f5t: "Saisons et classements",
      f5b: "Grimpez au classement mondial et à celui de la saison, affrontez vos amis chaque semaine et finissez la saison avec son cadre exclusif.",
      f6t: "À votre image",
      f6b: "Gagnez de l’or par votre travail et dépensez-le en thèmes. Les cadres animés mettent votre profil en valeur.",
      stepsTitle: "Comment ça marche",
      s1t: "Ajoutez une quête ou une habitude",
      s1b: "Lire un livre, s’entraîner, étudier : tout ce qui vous fait progresser.",
      s2t: "L’IA l’évalue",
      s2b: "Un prix juste en EXP, selon l’effort réel, le même pour tous.",
      s3t: "Faites-la et montez de niveau",
      s3b: "De l’EXP, de l’or, une série plus longue et un pas de plus vers le rang suivant.",
      ctaTitle: "Votre System vous attend.",
      ctaSub: "Commencez par quarante questions courtes qui situent où vous en êtes.",
      exampleTask: "Lire un roman de 300 pages",
      streakDays: "12 jours",
      footer: "The System",
    },
    de: {
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
      f3b: "Ein Einstiegstest zeigt, wo du stehst, und jede Aufgabe stärkt die Seite, die sie wirklich trainiert.",
      f4t: "Serien, die dich dranbleiben lassen",
      f4b: "Eine Sache pro Tag hält deine Serie. Einen Tag verpasst? Ein Freeze rettet sie. Um acht Uhr abends eine Erinnerung, bevor sie reißt.",
      f5t: "Saisons und Ranglisten",
      f5b: "Steig in der Welt- und Saisonrangliste auf, tritt jede Woche gegen Freunde an und beende die Saison mit ihrem exklusiven Rahmen.",
      f6t: "Mach es zu deinem",
      f6b: "Verdiene Gold mit deiner Arbeit und gib es für Themes aus. Animierte Rahmen schmücken dein Profil.",
      stepsTitle: "So funktioniert es",
      s1t: "Füge eine Quest oder Gewohnheit hinzu",
      s1b: "Ein Buch lesen, trainieren, lernen: alles, was dich besser macht.",
      s2t: "Die KI bewertet sie",
      s2b: "Ein fairer Preis in EXP, nach echtem Aufwand, gleich für alle.",
      s3t: "Erledige sie und steig auf",
      s3b: "EXP, Gold, eine längere Serie und ein Schritt näher zum nächsten Rang.",
      ctaTitle: "Dein System wartet.",
      ctaSub: "Starte mit vierzig kurzen Fragen, die zeigen, wo du heute stehst.",
      exampleTask: "Einen 300-Seiten-Roman lesen",
      streakDays: "12 Tage",
      footer: "The System",
    },
    ja: {
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
      f5b: "世界ランキングとシーズンランキングを駆け上がり、毎週友だちと対戦し、シーズン限定フレームを手に入れよう。",
      f6t: "自分らしく",
      f6b: "努力でゴールドを稼ぎ、テーマに使おう。動くフレームがプロフィールを彩ります。",
      stepsTitle: "使い方",
      s1t: "クエストや習慣を追加",
      s1b: "読書、トレーニング、勉強。成長につながることなら何でも。",
      s2t: "AIが評価",
      s2b: "実際の労力に基づく、誰にとっても同じ公平なEXP。",
      s3t: "達成してレベルアップ",
      s3b: "EXPとゴールド、伸びる連続記録、そして次のランクへ一歩前進。",
      ctaTitle: "あなたのSystemが待っています。",
      ctaSub: "今の自分を知る40の短い質問から始めましょう。",
      exampleTask: "300ページの小説を読む",
      streakDays: "12日",
      footer: "The System",
    },
    zh: {
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
      f5b: "冲上世界榜和赛季榜，每周与好友一对一比拼，赛季结束赢得限定头像框。",
      f6t: "打造你的风格",
      f6b: "用努力赚取金币，兑换主题。动态头像框让你的主页更出彩。",
      stepsTitle: "如何使用",
      s1t: "添加任务或习惯",
      s1b: "读书、训练、学习：任何让你变得更好的事。",
      s2t: "AI 评估分值",
      s2b: "按真实付出给出公平的经验值，人人相同。",
      s3t: "完成并升级",
      s3b: "经验、金币、更长的连续记录，离下一个段位更近一步。",
      ctaTitle: "你的 System 正在等你。",
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
            <div class="ld-chip ld-chip-task"><span>${esc(s("exampleTask"))}</span><b>+360 EXP</b></div>
            <div class="ld-chip ld-chip-rank"><img src="assets/ranks/S-128.png" alt="" height="34" /><b>S</b></div>
            <div class="ld-chip ld-chip-streak"><span class="ld-flame">${SYS.icon ? SYS.icon("flame", 16) : ""}</span><b>${esc(s("streakDays"))}</b></div>
          </div>
        </section>

        <section class="ld-ranks" aria-hidden="true">
          ${ranks.map((r) => `<img src="assets/ranks/${r}-128.png" alt="" height="${r === "S" ? 84 : 52 + ranks.indexOf(r) * 3}" loading="lazy" />`).join("")}
        </section>

        <section class="ld-section">
          <h2>${esc(s("featuresTitle"))}</h2>
          <div class="ld-features">
            ${feature(1, `<div class="ld-price"><span>${esc(s("exampleTask"))}</span><b>360 EXP</b></div>`)}
            ${feature(2, ["E", "C", "A", "S"].map((r) => `<img src="assets/ranks/${r}-128.png" alt="" height="48" loading="lazy" />`).join(""))}
            ${feature(3, `<div class="ld-intel">${intel.map((k) => `<img src="assets/intel/${k}-48.png" alt="" width="34" height="34" loading="lazy" />`).join("")}</div>`)}
            ${feature(4, `<div class="ld-streak"><span class="ld-flame big">${SYS.icon ? SYS.icon("flame", 30) : ""}</span><b>${esc(s("streakDays"))}</b></div>`)}
            ${feature(5, `<div class="ld-podium"><img src="assets/podium/second.png" alt="" height="62" loading="lazy" /><img src="assets/podium/first.png" alt="" height="80" loading="lazy" /><img src="assets/podium/third.png" alt="" height="56" loading="lazy" /></div>`)}
            ${feature(6, `<div class="ld-shop">${coin}<img src="assets/frames/aurenite-hud-128.png" alt="" height="64" loading="lazy" /><span class="gem" aria-hidden="true"></span></div>`)}
          </div>
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
