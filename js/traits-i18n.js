// The built-in traits' names in every language. A trait is saved by its
// English name, so switching language never rewrites anyone's data; this
// table only changes what is shown. A trait someone typed themselves has no
// entry and shows as they typed it.
(function (SYS) {
  "use strict";

  // English name: [ar, es, fr, de, ja, zh]
  const T = {
    "Self-motivation": ["التحفيز الذاتي", "Automotivación", "Motivation personnelle", "Selbstmotivation", "自己モチベーション", "自我激励"],
    "Reflection & thinking": ["التأمل والتفكير", "Reflexión y pensamiento", "Réflexion", "Reflexion & Nachdenken", "内省と思考", "反思与思考"],
    "Personal goal-setting": ["تحديد الأهداف الشخصية", "Fijar metas personales", "Fixer ses objectifs", "Persönliche Ziele setzen", "目標設定", "设定个人目标"],
    "Self-evaluation": ["التقييم الذاتي", "Autoevaluación", "Auto-évaluation", "Selbsteinschätzung", "自己評価", "自我评估"],
    "Time management": ["تنظيم الوقت", "Gestión del tiempo", "Gestion du temps", "Zeitmanagement", "時間管理", "时间管理"],
    "Emotional regulation": ["تنظيم الانفعالات", "Regulación emocional", "Régulation émotionnelle", "Emotionsregulation", "感情のコントロール", "情绪调节"],
    "Discipline & consistency": ["الانضباط والاستمرارية", "Disciplina y constancia", "Discipline et régularité", "Disziplin & Beständigkeit", "規律と継続", "自律与坚持"],
    "Focus & attention": ["التركيز والانتباه", "Concentración y atención", "Concentration", "Fokus & Aufmerksamkeit", "集中力", "专注力"],
    "Stress management": ["إدارة الضغط", "Manejo del estrés", "Gestion du stress", "Stressbewältigung", "ストレス管理", "压力管理"],
    "Sleep & rest": ["النوم والراحة", "Sueño y descanso", "Sommeil et repos", "Schlaf & Erholung", "睡眠と休息", "睡眠与休息"],
    "Learning skills": ["مهارات التعلّم", "Habilidades de aprendizaje", "Apprendre à apprendre", "Lernkompetenz", "学習スキル", "学习能力"],
    "Personal finance": ["إدارة المال الشخصي", "Finanzas personales", "Finances personnelles", "Persönliche Finanzen", "お金の管理", "个人理财"],
    "Volunteering": ["العمل التطوعي", "Voluntariado", "Bénévolat", "Ehrenamt", "ボランティア", "志愿服务"],
    "Social interaction": ["التفاعل الاجتماعي", "Interacción social", "Interactions sociales", "Soziale Kontakte", "人との交流", "社交互动"],
    "Participating in social activities": ["المشاركة في الأنشطة الاجتماعية", "Actividades sociales", "Activités sociales", "Soziale Aktivitäten", "社会活動への参加", "参与社交活动"],
    "Effective communication": ["التواصل الفعال", "Comunicación eficaz", "Communication efficace", "Wirksame Kommunikation", "伝える力", "有效沟通"],
    "Empathy & listening": ["التعاطف والإنصات", "Empatía y escucha", "Empathie et écoute", "Empathie & Zuhören", "共感と傾聴", "共情与倾听"],
    "Teamwork": ["العمل الجماعي", "Trabajo en equipo", "Travail d’équipe", "Teamarbeit", "チームワーク", "团队合作"],
    "Leadership": ["القيادة", "Liderazgo", "Leadership", "Führung", "リーダーシップ", "领导力"],
    "Conflict resolution": ["حل الخلافات", "Resolución de conflictos", "Résolution de conflits", "Konfliktlösung", "対立の解決", "化解冲突"],
    "Negotiation & persuasion": ["التفاوض والإقناع", "Negociación y persuasión", "Négociation et persuasion", "Verhandeln & Überzeugen", "交渉と説得", "谈判与说服"],
    "Friendships": ["بناء الصداقات", "Amistades", "Amitiés", "Freundschaften", "友人関係", "友谊"],
    "Family relationships": ["العلاقات الأسرية", "Relaciones familiares", "Relations familiales", "Familienbeziehungen", "家族との関係", "家庭关系"],
    "Teaching & mentoring": ["التعليم والإرشاد", "Enseñanza y mentoría", "Enseignement et mentorat", "Lehren & Mentoring", "教えることと指導", "教学与指导"],
    "Reading": ["القراءة", "Lectura", "Lecture", "Lesen", "読書", "阅读"],
    "Writing": ["الكتابة", "Escritura", "Écriture", "Schreiben", "執筆", "写作"],
    "Speaking": ["التحدث", "Expresión oral", "Expression orale", "Sprechen", "話す力", "口语表达"],
    "Language learning": ["تعلم اللغات", "Aprender idiomas", "Apprentissage des langues", "Sprachen lernen", "語学学習", "学习外语"],
    "Public speaking": ["الخطابة وإلقاء العروض", "Hablar en público", "Prise de parole en public", "Öffentliches Reden", "人前で話す", "公开演讲"],
    "Storytelling": ["السرد والحكي", "Narración", "Art du récit", "Geschichten erzählen", "ストーリーテリング", "讲故事"],
    "Vocabulary & expression": ["الثروة اللغوية والتعبير", "Vocabulario y expresión", "Vocabulaire et expression", "Wortschatz & Ausdruck", "語彙と表現", "词汇与表达"],
    "Listening comprehension": ["الاستيعاب السمعي", "Comprensión auditiva", "Compréhension orale", "Hörverstehen", "リスニング", "听力理解"],
    "Debate & argument": ["المناظرة والحِجاج", "Debate y argumentación", "Débat et argumentation", "Debattieren & Argumentieren", "ディベートと議論", "辩论与论证"],
    "Poetry": ["الشعر", "Poesía", "Poésie", "Lyrik", "詩", "诗歌"],
    "Translation": ["الترجمة", "Traducción", "Traduction", "Übersetzen", "翻訳", "翻译"],
    "Editing & proofreading": ["التحرير والتدقيق", "Edición y corrección", "Édition et relecture", "Lektorat & Korrektur", "編集と校正", "编辑与校对"],
    "Data analysis": ["تحليل البيانات", "Análisis de datos", "Analyse de données", "Datenanalyse", "データ分析", "数据分析"],
    "Puzzle solving": ["حل الألغاز", "Resolver acertijos", "Résolution d’énigmes", "Rätsel lösen", "パズル", "解谜"],
    "Programming": ["البرمجة", "Programación", "Programmation", "Programmieren", "プログラミング", "编程"],
    "Sports coaching & training": ["التعليم والتدريب الرياضي", "Entrenamiento deportivo", "Coaching sportif", "Sporttraining & Coaching", "スポーツ指導", "运动教练与训练"],
    "Mathematics": ["الرياضيات", "Matemáticas", "Mathématiques", "Mathematik", "数学", "数学"],
    "Critical thinking": ["التفكير النقدي", "Pensamiento crítico", "Esprit critique", "Kritisches Denken", "批判的思考", "批判性思维"],
    "Problem solving": ["حل المشكلات", "Resolución de problemas", "Résolution de problèmes", "Problemlösen", "問題解決", "解决问题"],
    "Systems & planning": ["التفكير المنظومي والتخطيط", "Sistemas y planificación", "Systèmes et planification", "Systeme & Planung", "システム思考と計画", "系统思维与规划"],
    "Scientific method": ["المنهج العلمي والتجريب", "Método científico", "Démarche scientifique", "Wissenschaftliche Methode", "科学的方法", "科学方法"],
    "Strategy games": ["ألعاب الاستراتيجية", "Juegos de estrategia", "Jeux de stratégie", "Strategiespiele", "戦略ゲーム", "策略游戏"],
    "Statistics & probability": ["الإحصاء والاحتمالات", "Estadística y probabilidad", "Statistiques et probabilités", "Statistik & Wahrscheinlichkeit", "統計と確率", "统计与概率"],
    "Research": ["البحث", "Investigación", "Recherche", "Recherche", "リサーチ", "研究"],
    "Yoga": ["اليوغا", "Yoga", "Yoga", "Yoga", "ヨガ", "瑜伽"],
    "Sports": ["الرياضة", "Deporte", "Sport", "Sport", "スポーツ", "运动"],
    "Self-defense techniques": ["تقنيات الدفاع عن النفس", "Defensa personal", "Self-défense", "Selbstverteidigung", "護身術", "防身术"],
    "Handcrafts": ["المهارات اليدوية", "Manualidades", "Travaux manuels", "Handwerk", "手工芸", "手工"],
    "Daily exercise": ["التمارين اليومية", "Ejercicio diario", "Exercice quotidien", "Tägliche Bewegung", "毎日の運動", "日常锻炼"],
    "Acting": ["التمثيل", "Actuación", "Théâtre", "Schauspiel", "演技", "表演"],
    "Health": ["الصحة", "Salud", "Santé", "Gesundheit", "健康", "健康"],
    "Strength training": ["تمارين القوة", "Entrenamiento de fuerza", "Musculation", "Krafttraining", "筋力トレーニング", "力量训练"],
    "Endurance & cardio": ["التحمّل واللياقة", "Resistencia y cardio", "Endurance et cardio", "Ausdauer & Cardio", "持久力と有酸素運動", "耐力与有氧"],
    "Flexibility & balance": ["المرونة والتوازن", "Flexibilidad y equilibrio", "Souplesse et équilibre", "Beweglichkeit & Balance", "柔軟性とバランス", "柔韧与平衡"],
    "Dance & movement": ["الرقص والتعبير الحركي", "Baile y movimiento", "Danse et mouvement", "Tanz & Bewegung", "ダンスと身体表現", "舞蹈与律动"],
    "Recovery & injury care": ["التعافي والوقاية من الإصابات", "Recuperación y lesiones", "Récupération et blessures", "Regeneration & Verletzungsvorsorge", "回復とケガ予防", "恢复与伤病护理"],
    "Survival techniques": ["تقنيات البقاء في الطبيعة", "Técnicas de supervivencia", "Techniques de survie", "Überlebenstechniken", "サバイバル技術", "野外生存技巧"],
    "Outdoor activities": ["الأنشطة الخارجية", "Actividades al aire libre", "Activités de plein air", "Aktivitäten im Freien", "アウトドア", "户外活动"],
    "Learning about the environment": ["التعلم عن البيئة", "Conocer el medio ambiente", "Découvrir l’environnement", "Umweltwissen", "環境について学ぶ", "了解环境"],
    "Farming & gardening": ["الزراعة والبستنة", "Agricultura y jardinería", "Jardinage et agriculture", "Gärtnern & Landwirtschaft", "農業とガーデニング", "种植与园艺"],
    "Animal care": ["رعاية الحيوانات", "Cuidado de animales", "Soin des animaux", "Tierpflege", "動物の世話", "照顾动物"],
    "Plant knowledge": ["معرفة النباتات", "Conocimiento de plantas", "Connaissance des plantes", "Pflanzenkunde", "植物の知識", "植物知识"],
    "Hiking & navigation": ["المشي الطويل والتوجّه", "Senderismo y orientación", "Randonnée et orientation", "Wandern & Navigation", "ハイキングとナビゲーション", "徒步与导航"],
    "Sustainability & recycling": ["الاستدامة وإعادة التدوير", "Sostenibilidad y reciclaje", "Durabilité et recyclage", "Nachhaltigkeit & Recycling", "サステナビリティとリサイクル", "可持续与回收"],
    "Astronomy & the night sky": ["الفلك ومراقبة السماء", "Astronomía y cielo nocturno", "Astronomie et ciel nocturne", "Astronomie & Nachthimmel", "天文と夜空", "天文与星空"],
    "Camping": ["التخييم", "Acampada", "Camping", "Camping", "キャンプ", "露营"],
    "3D planning": ["التخطيط ثلاثي الأبعاد", "Planificación en 3D", "Conception en 3D", "3D-Planung", "3D設計", "3D 规划"],
    "Graphic design": ["التصميم الجرافيكي", "Diseño gráfico", "Graphisme", "Grafikdesign", "グラフィックデザイン", "平面设计"],
    "Photography": ["التصوير", "Fotografía", "Photographie", "Fotografie", "写真", "摄影"],
    "Drawing": ["الرسم", "Dibujo", "Dessin", "Zeichnen", "デッサン", "素描"],
    "Painting & colour": ["التلوين واللون", "Pintura y color", "Peinture et couleur", "Malen & Farbe", "絵画と色彩", "绘画与色彩"],
    "Video & editing": ["التصوير والمونتاج", "Vídeo y edición", "Vidéo et montage", "Video & Schnitt", "動画撮影と編集", "视频与剪辑"],
    "Space arrangement": ["تنسيق المساحات", "Organización de espacios", "Aménagement de l’espace", "Raumgestaltung", "空間のレイアウト", "空间布置"],
    "Maps & orientation": ["الخرائط والتوجّه المكاني", "Mapas y orientación", "Cartes et orientation", "Karten & Orientierung", "地図と方向感覚", "地图与方向感"],
    "Calligraphy": ["الخط", "Caligrafía", "Calligraphie", "Kalligrafie", "書道", "书法"],
    "Sculpting & modelling": ["النحت والتشكيل", "Escultura y modelado", "Sculpture et modelage", "Bildhauerei & Modellieren", "彫刻と造形", "雕塑与造型"],
    "Animation": ["الرسم المتحرك", "Animación", "Animation", "Animation", "アニメーション", "动画"],
    "Visual memory": ["الذاكرة البصرية", "Memoria visual", "Mémoire visuelle", "Visuelles Gedächtnis", "視覚的記憶", "视觉记忆"],
    "Playing an instrument": ["العزف على آلة موسيقية", "Tocar un instrumento", "Jouer d’un instrument", "Ein Instrument spielen", "楽器演奏", "演奏乐器"],
    "Active listening": ["الاستماع النشط", "Escucha activa", "Écoute active", "Aktives Hören", "能動的な鑑賞", "主动聆听"],
    "Vocal training": ["التدريب الصوتي", "Entrenamiento vocal", "Travail de la voix", "Stimmtraining", "ボイストレーニング", "声乐训练"],
    "Musical creativity": ["الإبداع الموسيقي", "Creatividad musical", "Créativité musicale", "Musikalische Kreativität", "音楽的創造力", "音乐创作"],
    "Rhythm & timing": ["الإيقاع والتوقيت", "Ritmo y tempo", "Rythme et tempo", "Rhythmus & Timing", "リズムとタイミング", "节奏与节拍"],
    "Music theory": ["نظرية الموسيقى", "Teoría musical", "Théorie musicale", "Musiktheorie", "音楽理論", "乐理"],
    "Ear training": ["التدريب السمعي", "Entrenamiento auditivo", "Formation de l’oreille", "Gehörbildung", "耳のトレーニング", "练耳"],
    "Performing": ["الأداء أمام جمهور", "Actuar en público", "Se produire en public", "Auftreten", "人前での演奏", "登台表演"],
  };
  const COL = { ar: 0, es: 1, fr: 2, de: 3, ja: 4, zh: 5 };
  SYS.TRAIT_NAMES = T;

  // A trait's name in the app's language: the table, then a saved Arabic
  // name for Arabic, then the name as saved.
  SYS.traitName = function (tr) {
    const name = typeof tr === "string" ? tr : (tr && tr.name) || "";
    const lang = SYS.currentLanguage ? SYS.currentLanguage() : "en";
    if (lang === "en") return name;
    const row = T[name];
    if (row && row[COL[lang]]) return row[COL[lang]];
    if (lang === "ar" && tr && tr.ar) return tr.ar;
    return name;
  };
})(window.SYS = window.SYS || {});
