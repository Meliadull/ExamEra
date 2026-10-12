/* Demo data: users of all roles, groups, subjects, tests and a month of results. */
import crypto from 'node:crypto';
import { all, get, now, run, tx } from './db.js';
import { hashPassword } from './services/auth.js';
import { DEMO_PASSWORD } from './services/demo.js';
import { isAnswered, scoreAnswer } from './services/scoring.js';
import { loadQuestions, replaceQuestions, type QuestionInput } from './services/tests.js';


function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20250412);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const days = (n: number) => new Date(Date.now() + n * 86400_000);
const iso = (d: Date) => d.toISOString();
const at = (dayOffset: number, hour: number, minute = 0) => {
  const d = days(dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const S = (text: string, options: string[], correct: number | number[], score = 1, explanation = ''): QuestionInput => ({
  type: Array.isArray(correct) ? 'multiple' : 'single',
  text,
  score,
  explanation,
  options: options.map((o, i) => ({ text: o, isCorrect: Array.isArray(correct) ? correct.includes(i) : i === correct })),
});
const YN = (text: string, yes: boolean, score = 1): QuestionInput => ({
  type: 'yes_no',
  text,
  score,
  explanation: '',
  options: [{ text: 'yes', isCorrect: yes }, { text: 'no', isCorrect: !yes }],
});
const TF = (text: string, isTrue: boolean, score = 1, explanation = ''): QuestionInput => ({
  type: 'true_false',
  text,
  score,
  explanation,
  options: [{ text: 'true', isCorrect: isTrue }, { text: 'false', isCorrect: !isTrue }],
});
const ST = (text: string, accepted: string[], score = 1, explanation = ''): QuestionInput => ({
  type: 'short_text',
  text,
  score,
  explanation,
  options: accepted.map((a) => ({ text: a, isCorrect: true })),
});

const BANK: Record<string, QuestionInput[]> = {
  quadratic: [
    S('Решите уравнение: $2(x - 3) = 10$', ['$x = 2$', '$x = 3$', '$x = 8$', '$x = 5$'], 2, 1, '$2x - 6 = 10 \\Rightarrow 2x = 16 \\Rightarrow x = 8$'),
    S('Чему равен дискриминант уравнения $x^2 - 5x + 6 = 0$?', ['1', '25', '-1', '11'], 0, 1, '$D = b^2 - 4ac = 25 - 24 = 1$'),
    S('Найдите корни уравнения $x^2 - 9 = 0$', ['$\\pm 3$', '$3$', '$9$', '$\\pm 9$'], 0),
    S('Какие из чисел являются корнями уравнения $x^2 - 3x + 2 = 0$?', ['1', '2', '3', '-1'], [0, 1], 2),
    TF('Уравнение $x^2 + 1 = 0$ не имеет действительных корней.', true),
    S('Сумма корней уравнения $x^2 - 7x + 10 = 0$ равна:', ['7', '10', '-7', '3'], 0, 1, 'По теореме Виета $x_1 + x_2 = -b/a = 7$'),
    ST('Произведение корней уравнения $x^2 - 4x + 3 = 0$ равно ...', ['3'], 1, 'По теореме Виета $x_1 \\cdot x_2 = c/a = 3$'),
    S('При каком $D$ уравнение имеет два различных корня?', ['$D > 0$', '$D = 0$', '$D < 0$', 'При любом'], 0),
  ],
  linear: [
    S('Чему равно значение выражения $2x + 3$, если $x = 4$?', ['7', '8', '10', '11'], 3),
    S('Решите уравнение $3x = 12$', ['3', '4', '9', '36'], 1),
    S('Решите уравнение $5x - 5 = 20$', ['3', '4', '5', '6'], 2),
    TF('Уравнение $0 \\cdot x = 5$ не имеет решений.', true),
    ST('Решите уравнение $x + 7 = 15$. $x$ = ...', ['8'], 1),
    S('Какая из функций является линейной?', ['$y = 2x + 1$', '$y = x^2$', '$y = 1/x$', '$y = \\sqrt{x}$'], 0),
  ],
  percent: [
    S('Сколько составляет 20% от 150?', ['15', '20', '30', '45'], 2),
    S('Цена товара 200 000 сум увеличилась на 10%. Новая цена:', ['210 000', '220 000', '202 000', '180 000'], 1),
    ST('Какой процент составляет число 25 от 100?', ['25', '25%'], 1),
    S('Какие из дробей равны 50%?', ['$\\frac{1}{2}$', '$\\frac{2}{4}$', '$\\frac{1}{5}$', '$0{,}5$'], [0, 1, 3], 2),
    TF('20% от 50 больше, чем 50% от 20.', false, 1, 'Оба значения равны 10'),
    S('Какой результат выражения $5 \\times 4$?', ['10', '15', '20', '25'], 2),
    S('Вычислите: $15\\%$ от $200$', ['15', '20', '30', '35'], 2),
    S('Сколько процентов составляет $\\frac{3}{4}$?', ['34%', '43%', '75%', '80%'], 2),
    YN('Верно ли, что $0{,}1 = 10\\%$?', true),
    S('Число увеличили на 50%, затем уменьшили на 50%. Как изменилось число?', ['Не изменилось', 'Уменьшилось на 25%', 'Увеличилось на 25%', 'Уменьшилось на 50%'], 1, 2),
    ST('Вычислите $\\sqrt{144}$', ['12'], 1),
    S('Выберите наибольшее число:', ['0,5', '45%', '$\\frac{2}{5}$', '0,48'], 0),
  ],
  newton: [
    S('Какой закон Ньютона называют законом инерции?', ['Первый', 'Второй', 'Третий', 'Закон всемирного тяготения'], 0),
    S('Формула второго закона Ньютона:', ['$F = ma$', '$F = mg$', '$E = mc^2$', '$p = mv$'], 0),
    S('Единица измерения силы в СИ:', ['Джоуль', 'Ньютон', 'Ватт', 'Паскаль'], 1),
    TF('Силы, с которыми тела действуют друг на друга, равны по модулю и противоположны по направлению.', true),
    S('Тело массой 2 кг движется с ускорением $3\\ м/с^2$. Найдите силу.', ['1,5 Н', '5 Н', '6 Н', '9 Н'], 2, 1, '$F = ma = 2 \\cdot 3 = 6$ Н'),
    S('Какие величины являются векторными?', ['Сила', 'Масса', 'Ускорение', 'Время'], [0, 2], 2),
    ST('Ускорение свободного падения на Земле приблизительно равно ... м/с²', ['9,8', '9.8', '10', '9,81'], 1),
    YN('Может ли тело двигаться при отсутствии действующих на него сил?', true),
  ],
  ancient: [
    S('В каком году до н.э. Александр Македонский вошёл в Мараканду (Самарканд)?', ['329', '500', '146', '44'], 0),
    S('Столицей какого государства был Вавилон?', ['Египет', 'Вавилония', 'Персия', 'Греция'], 1),
    S('Кто построил первую пирамиду в Египте?', ['Хеопс', 'Джосер', 'Тутанхамон', 'Рамзес II'], 1),
    TF('Великий шёлковый путь проходил через территорию современного Узбекистана.', true),
    S('Какие из перечисленных городов находились в Древней Греции?', ['Афины', 'Спарта', 'Карфаген', 'Мемфис'], [0, 1], 2),
    ST('Как назывался древнегреческий свод законов в Афинах, введённый Драконтом? (одно слово)', ['законы драконта', 'драконовы', 'драконовы законы'], 1),
  ],
  pastperfect: [
    S('Choose the correct form: By the time we arrived, the film ___.', ['started', 'had started', 'has started', 'was start'], 1),
    S('Past Perfect is formed with:', ['had + V3', 'have + V3', 'was + V-ing', 'did + V1'], 0),
    S('She ___ never ___ sushi before that day.', ['has / eaten', 'had / eaten', 'did / eat', 'was / eating'], 1),
    TF('"I had finished my homework before dinner" is Past Perfect.', true),
    ST('Write the V3 form of "go"', ['gone'], 1),
    S('Choose sentences in Past Perfect:', ['They had left.', 'They have left.', 'She had seen it.', 'She saw it.'], [0, 2], 2),
  ],
  kinematics: [
    S('Скорость — это:', ['Путь за единицу времени', 'Сила на единицу массы', 'Масса на объём', 'Работа за время'], 0),
    S('Автомобиль проехал 120 км за 2 часа. Средняя скорость:', ['40 км/ч', '60 км/ч', '120 км/ч', '240 км/ч'], 1),
    TF('При равномерном прямолинейном движении ускорение равно нулю.', true),
    ST('Переведите 72 км/ч в м/с', ['20'], 1),
    S('Единица ускорения в СИ:', ['м/с', 'м/с²', 'Н', 'км/ч'], 1),
  ],
  medieval: [
    S('В каком веке жил Амир Темур?', ['XII', 'XIV', 'XVI', 'X'], 1),
    S('Столица государства Темура:', ['Бухара', 'Хива', 'Самарканд', 'Ташкент'], 2),
    S('Кто из учёных родом из Хорезма?', ['Аль-Хорезми', 'Улугбек', 'Навои', 'Бабур'], 0),
    TF('Обсерватория Улугбека находится в Самарканде.', true),
    S('Какие произведения написал Алишер Навои?', ['«Хамса»', '«Бабур-наме»', '«Фархад и Ширин»', '«Канон врачебной науки»'], [0, 2], 2),
  ],
  presentsimple: [
    S('He ___ to school every day.', ['go', 'goes', 'going', 'gone'], 1),
    S('___ you like apples?', ['Does', 'Do', 'Are', 'Is'], 1),
    TF('"She don\'t like coffee" is grammatically correct.', false),
    ST('Write the negative: "I like tea" → "I ___ like tea"', ["don't", 'do not'], 1),
    S('Choose the correct sentence:', ['She play tennis.', 'She plays tennis.', 'She playing tennis.', 'She is play tennis.'], 1),
  ],
  informatics: [
    S('Сколько бит в одном байте?', ['4', '8', '16', '1024'], 1),
    S('Какая система счисления используется в компьютере?', ['Десятичная', 'Двоичная', 'Римская', 'Восьмеричная'], 1),
    ST('Переведите число 101₂ в десятичную систему', ['5'], 1),
    TF('HTML — это язык программирования.', false, 1, 'HTML — язык разметки'),
    S('Какие из устройств являются устройствами ввода?', ['Клавиатура', 'Мышь', 'Монитор', 'Принтер'], [0, 1], 2),
  ],
};

interface Person {
  first: string;
  last: string;
}
const STUDENTS: Record<string, Person[]> = {
  '01/25': [
    { first: 'Gulbar', last: 'Ergashaliyeva' }, { first: 'Мария', last: 'Смирнова' }, { first: 'Азиз', last: 'Рахимов' },
    { first: 'Дильноза', last: 'Каримова' }, { first: 'Тимур', last: 'Юсупов' }, { first: 'Анна', last: 'Ким' },
    { first: 'Бекзод', last: 'Турсунов' }, { first: 'Камила', last: 'Ахмедова' }, { first: 'Сардор', last: 'Назаров' },
    { first: 'Елена', last: 'Попова' }, { first: 'Жасур', last: 'Исмоилов' }, { first: 'Малика', last: 'Холматова' },
  ],
  '101/26': [
    { first: 'Шахзод', last: 'Алимов' }, { first: 'Ольга', last: 'Ли' }, { first: 'Улугбек', last: 'Мирзаев' },
    { first: 'Нилуфар', last: 'Собирова' }, { first: 'Даниил', last: 'Кузнецов' }, { first: 'Зарина', last: 'Усмонова' },
    { first: 'Фаррух', last: 'Джураев' }, { first: 'Севара', last: 'Абдуллаева' }, { first: 'Игорь', last: 'Пак' },
    { first: 'Мадина', last: 'Эргашева' }, { first: 'Акмал', last: 'Хасанов' },
  ],
  '102/26': [
    { first: 'Ислом', last: 'Каримов' }, { first: 'Виктория', last: 'Цой' }, { first: 'Отабек', last: 'Нуриддинов' },
    { first: 'Гулноза', last: 'Рашидова' }, { first: 'Артём', last: 'Волков' }, { first: 'Лола', last: 'Саидова' },
    { first: 'Рустам', last: 'Шарипов' }, { first: 'Диана', last: 'Мун' }, { first: 'Хуршид', last: 'Обидов' },
    { first: 'Феруза', last: 'Латипова' },
  ],
};

export async function seedDemo() {
  console.log('Seeding demo data…');
  const hash = await hashPassword(DEMO_PASSWORD);
  const created = iso(days(-120));

  tx(() => {
    const user = (first: string, last: string, role: string, phone: string | null, email: string | null) =>
      run(
        `INSERT INTO users (first_name, last_name, phone, email, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        first, last, phone, email, hash, role, created, created,
      ).id;

    const admin = user("O'quv", "bo'limi", 'admin', '+998900000001', 'admin@examera.uz');
    const teacher = user('Nargiza', 'Xajimirzayeva', 'teacher', '+998900000002', 'n.xajimirzayeva@examera.uz');
    const teacher2 = user('Нигора', 'Каримова', 'teacher', '+998900000004', 'n.karimova@examera.uz');
    user('Jahongir', 'Mirzarayimov', 'auditor', '+998900000003', 'auditor@examera.uz');

    run(
      "INSERT INTO academic_periods (name, starts_on, ends_on, is_current) VALUES ('2025–2026 учебный год', ?, ?, 1)",
      `${days(-200).getFullYear()}-09-01`,
      `${days(-200).getFullYear() + 1}-05-31`,
    );

    const subjects: Record<string, number> = {};
    const subj = (name: string, description: string, topics: string[], teachers: number[]) => {
      const id = run('INSERT INTO subjects (name, description, topics, created_at) VALUES (?, ?, ?, ?)', name, description, JSON.stringify(topics), created).id;
      teachers.forEach((t) => run('INSERT INTO subject_teachers (subject_id, user_id) VALUES (?, ?)', id, t));
      subjects[name] = id;
    };
    subj('Математика', 'Алгебра и геометрия', ['Квадратные уравнения', 'Линейные уравнения', 'Проценты', 'Геометрия'], [teacher]);
    subj('Физика', 'Механика, электричество, оптика', ['Законы Ньютона', 'Кинематика', 'Электричество'], [teacher]);
    subj('История', 'Всемирная история и история Узбекистана', ['Древний мир', 'Средние века', 'История Узбекистана'], [teacher2]);
    subj('Английский язык', 'Грамматика и лексика', ['Past Perfect', 'Present Simple', 'Vocabulary'], [teacher2]);
    subj('Информатика', 'Основы информатики и программирования', ['Системы счисления', 'Аппаратное обеспечение'], [teacher]);
    subj('Химия', 'Общая и неорганическая химия', ['Периодическая система'], []);
    subj('Биология', 'Ботаника, зоология, анатомия', ['Клетка'], []);

    const year = `${days(-200).getFullYear()}–${days(-200).getFullYear() + 1}`;
    let phoneSeq = 1234567;
    const groupIds: Record<string, number> = {};
    for (const [gname, people] of Object.entries(STUDENTS)) {
      const gid = run('INSERT INTO study_groups (name, academic_year, status, created_at) VALUES (?, ?, ?, ?)', gname, year, 'active', created).id;
      groupIds[gname] = gid;
      // One class leader per group: Xajimirzayeva leads 01/25, Karimova leads 101/26 and 102/26.
      run('INSERT INTO group_teachers (group_id, user_id) VALUES (?, ?)', gid, gname === '01/25' ? teacher : teacher2);
      Object.values(subjects).slice(0, 5).forEach((sid) => run('INSERT INTO group_subjects (group_id, subject_id) VALUES (?, ?)', gid, sid));
      for (const p of people) {
        const isDemo = p.first === 'Gulbar' && p.last === 'Ergashaliyeva';
        const phone = isDemo ? '+998901234567' : `+99890${String(phoneSeq++ + 1000).padStart(7, '0')}`;
        const email = isDemo ? 'alexey@example.com' : null;
        const uid = user(p.first, p.last, 'student', phone, email);
        run('INSERT INTO group_students (group_id, user_id) VALUES (?, ?)', gid, uid);
      }
    }

    const skill = new Map<number, number>();
    for (const r of all<{ id: number }>("SELECT id FROM users WHERE role = 'student'")) skill.set(r.id, 0.45 + rnd() * 0.5);

    type TestDef = {
      title: string;
      subject: string;
      topic: string;
      bank: string;
      teacher: number;
      status: 'draft' | 'published' | 'completed' | 'archived';
      duration: number | null;
      difficulty?: number;
      assignments?: { groups: string[]; start: Date; end: Date; complete?: boolean; showAnswers?: boolean; attempts?: number }[];
      shuffle?: boolean;
    };
    const defs: TestDef[] = [
      { title: 'Контрольная работа №3', subject: 'Математика', topic: 'Квадратные уравнения', bank: 'quadratic', teacher, status: 'completed', duration: 40, difficulty: -0.12,
        assignments: [{ groups: ['01/25', '101/26'], start: at(-4, 9), end: at(-2, 18), complete: true, showAnswers: true }] },
      { title: 'Тест по истории', subject: 'История', topic: 'Древний мир', bank: 'ancient', teacher: teacher2, status: 'published', duration: 30,
        assignments: [{ groups: ['01/25', '102/26'], start: at(-2, 8), end: at(5, 20), complete: true }] },
      { title: 'Итоговый тест', subject: 'Физика', topic: 'Законы Ньютона', bank: 'newton', teacher, status: 'completed', duration: 45,
        assignments: [{ groups: ['102/26', '101/26'], start: at(-6, 9), end: at(-4, 18), complete: true, showAnswers: true }] },
      { title: 'Тест — Грамматика', subject: 'Английский язык', topic: 'Past Perfect', bank: 'pastperfect', teacher: teacher2, status: 'draft', duration: 25 },
      { title: 'Алгебра — Тема 5', subject: 'Математика', topic: 'Линейные уравнения', bank: 'linear', teacher, status: 'archived', duration: 20,
        assignments: [{ groups: ['01/25'], start: at(-28, 9), end: at(-27, 18), complete: true }] },
      { title: 'Самостоятельная работа: линейные уравнения', subject: 'Математика', topic: 'Линейные уравнения', bank: 'linear', teacher, status: 'completed', duration: 20,
        assignments: [{ groups: ['101/26', '102/26'], start: at(-25, 9), end: at(-24, 18), complete: true }] },
      { title: 'Кинематика — проверочная', subject: 'Физика', topic: 'Кинематика', bank: 'kinematics', teacher, status: 'completed', duration: 20, difficulty: 0.05,
        assignments: [{ groups: ['01/25', '101/26', '102/26'], start: at(-21, 9), end: at(-20, 18), complete: true }] },
      { title: 'Средние века: Темуриды', subject: 'История', topic: 'Средние века', bank: 'medieval', teacher: teacher2, status: 'completed', duration: 25,
        assignments: [{ groups: ['01/25', '101/26'], start: at(-17, 9), end: at(-16, 18), complete: true }] },
      { title: 'Present Simple — quiz', subject: 'Английский язык', topic: 'Present Simple', bank: 'presentsimple', teacher: teacher2, status: 'completed', duration: 15, difficulty: 0.08,
        assignments: [{ groups: ['01/25', '102/26'], start: at(-13, 9), end: at(-12, 18), complete: true }] },
      { title: 'Основы информатики', subject: 'Информатика', topic: 'Системы счисления', bank: 'informatics', teacher, status: 'completed', duration: 20,
        assignments: [{ groups: ['01/25', '101/26', '102/26'], start: at(-9, 9), end: at(-8, 18), complete: true }] },
      { title: 'Проценты — контрольная', subject: 'Математика', topic: 'Проценты', bank: 'percent', teacher, status: 'completed', duration: 30, difficulty: -0.05,
        assignments: [{ groups: ['102/26'], start: at(-7, 9), end: at(-6, 18), complete: true }] },
      { title: 'Математика — Итоговый тест', subject: 'Математика', topic: 'Проценты', bank: 'percent', teacher, status: 'published', duration: 30, shuffle: true,
        assignments: [{ groups: ['01/25', '101/26'], start: at(-1, 8), end: at(6, 20), attempts: 2, showAnswers: true }] },
      { title: 'Физика — Законы Ньютона', subject: 'Физика', topic: 'Законы Ньютона', bank: 'newton', teacher, status: 'published', duration: 30,
        assignments: [{ groups: ['01/25'], start: at(1, 10), end: at(4, 18) }] },
      { title: 'Английский — Grammar', subject: 'Английский язык', topic: 'Past Perfect', bank: 'pastperfect', teacher: teacher2, status: 'published', duration: 25,
        assignments: [{ groups: ['01/25', '101/26'], start: at(3, 12), end: at(7, 18) }] },
    ];

    for (const d of defs) {
      const createdAt = d.assignments?.[0] ? iso(days((Date.parse(iso(d.assignments[0].start)) - Date.now()) / 86400_000 - 3)) : iso(days(-1));
      const testId = run(
        `INSERT INTO tests (title, subject_id, teacher_id, topic, description, instruction, duration_min, attempts_limit, pass_score,
           shuffle_questions, shuffle_options, show_result, show_answers, status, created_at, updated_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 60, ?, ?, 1, ?, ?, ?, ?, ?)`,
        d.title,
        subjects[d.subject],
        d.teacher,
        d.topic,
        `Тест для проверки знаний по теме «${d.topic}». Включает задачи разного уровня сложности.`,
        'Внимательно прочитайте каждый вопрос. Ответы сохраняются автоматически. Нажмите «Завершить тест», когда закончите.',
        d.duration,
        d.shuffle ?? false,
        d.shuffle ?? false,
        d.assignments?.some((a) => a.showAnswers) ?? false,
        d.status,
        createdAt,
        createdAt,
        d.status === 'draft' ? null : createdAt,
      ).id;
      replaceQuestions(testId, structuredClone(BANK[d.bank]));
      const questions = loadQuestions(testId);

      for (const a of d.assignments ?? []) {
        for (const gname of a.groups) {
          const asgId = run(
            `INSERT INTO assignments (test_id, group_id, starts_at, ends_at, duration_min, attempts_limit, pass_score, show_result, show_answers, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 60, 1, ?, ?, ?)`,
            testId, groupIds[gname], iso(a.start), iso(a.end), d.duration, a.attempts ?? 1, a.showAnswers ?? false, d.teacher, iso(days(-30)),
          ).id;
          const members = all<{ user_id: number }>('SELECT user_id FROM group_students WHERE group_id = ?', groupIds[gname]);
          for (const m of members) {
            if (!a.complete) continue;
            if (a.end.getTime() > Date.now() && rnd() < 0.45) continue; // some students haven't taken an open test yet
            if (rnd() < 0.06) continue; // a few missed the test
            const isDemoStudent = get<{ phone: string }>('SELECT phone FROM users WHERE id = ?', m.user_id)?.phone === '+998901234567';
            if (isDemoStudent && a.end.getTime() > Date.now()) continue; // keep an open test for the demo student
            const span = Math.min(a.end.getTime(), Date.now() - 3600_000) - a.start.getTime();
            const started = new Date(a.start.getTime() + rnd() * Math.max(span - 3600_000, 600_000));
            const dur = Math.round((d.duration ?? 30) * 60 * (0.45 + rnd() * 0.5));
            const completed = new Date(started.getTime() + dur * 1000);
            const p = Math.min(0.97, Math.max(0.15, (skill.get(m.user_id) ?? 0.6) + (d.difficulty ?? 0) + (rnd() - 0.5) * 0.15));
            const attemptId = run(
              `INSERT INTO attempts (assignment_id, test_id, user_id, status, started_at, deadline_at, question_order, option_order)
               VALUES (?, ?, ?, 'in_progress', ?, ?, ?, '{}')`,
              asgId, testId, m.user_id, iso(started), iso(new Date(started.getTime() + (d.duration ?? 30) * 60_000)), JSON.stringify(questions.map((q) => q.id)),
            ).id;
            let score = 0, max = 0, correct = 0, wrong = 0, skipped = 0;
            for (const q of questions) {
              max += q.score;
              let ans: unknown = null;
              if (rnd() > 0.04) {
                const right = rnd() < p;
                const corr = q.options.filter((o) => o.is_correct);
                const inc = q.options.filter((o) => !o.is_correct);
                if (q.type === 'short_text') ans = right ? corr[0].text : pick(['не знаю', '0', '7', 'x']);
                else if (q.type === 'multiple') ans = right ? corr.map((o) => o.id) : [pick(inc).id, corr[0].id].slice(0, 1 + Math.floor(rnd() * 2));
                else ans = right ? corr[0].id : pick(inc).id;
              }
              const r = scoreAnswer(q, ans, 'strict');
              if (!r.answered) skipped++;
              else if (r.isCorrect) correct++;
              else wrong++;
              score += r.score;
              run(
                'INSERT INTO student_answers (attempt_id, question_id, answer, is_correct, score, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                attemptId, q.id, isAnswered(q.type, ans) ? JSON.stringify(ans) : null, r.answered ? (r.isCorrect ? 1 : 0) : null, r.score, iso(completed),
              );
            }
            const pct = Math.round((score / max) * 1000) / 10;
            run(
              `UPDATE attempts SET status = 'completed', completed_at = ?, score = ?, max_score = ?, percentage = ?, correct_count = ?,
                 wrong_count = ?, skipped_count = ?, duration_sec = ?, passed = ?, finish_reason = 'manual' WHERE id = ?`,
              iso(completed), score, max, pct, correct, wrong, skipped, dur, pct >= 60, attemptId,
            );
            const u = get<any>('SELECT first_name, last_name FROM users WHERE id = ?', m.user_id);
            auditAt(completed, m.user_id, `${u.first_name} ${u.last_name}`, 'student', 'attempt.finish', 'attempt', attemptId, { testId, percentage: pct });
            auditAt(new Date(started.getTime() - 120_000), m.user_id, `${u.first_name} ${u.last_name}`, 'student', 'auth.login', 'user', m.user_id, { method: 'phone' });
          }
        }
      }
      auditAt(new Date(createdAt), d.teacher, d.teacher === teacher ? 'Nargiza Xajimirzayeva' : 'Нигора Каримова', 'teacher', 'test.create', 'test', testId, { title: d.title });
    }

    // Notifications for the demo accounts
    const demo = get<{ id: number }>("SELECT id FROM users WHERE phone = '+998901234567'")!.id;
    const n = (uid: number, type: string, params: object, link: string, ago: number) =>
      run('INSERT INTO notifications (user_id, type, params, link, created_at) VALUES (?, ?, ?, ?, ?)', uid, type, JSON.stringify(params), link, iso(days(-ago)));
    n(demo, 'test_assigned', { test: 'Математика — Итоговый тест', subject: 'Математика' }, '/app/my-tests', 1);
    n(demo, 'test_assigned', { test: 'Физика — Законы Ньютона', subject: 'Физика' }, '/app/my-tests', 0.5);
    n(teacher, 'attempt_completed', { student: 'Мария Смирнова', test: 'Контрольная работа №3', percentage: 92 }, '/app/tests', 2);
    n(teacher, 'group_completed', { group: '102/26', test: 'Итоговый тест' }, '/app/tests', 4);
    auditAt(days(-1), admin, "O'quv bo'limi", 'admin', 'auth.login', 'user', admin, { method: 'phone' });
  });
  console.log(`Demo data ready. Password for all demo accounts: ${DEMO_PASSWORD}`);
}

function auditAt(when: Date, userId: number, name: string, role: string, action: string, entityType: string, entityId: number, metadata: object) {
  run(
    `INSERT INTO audit_log (event_id, user_id, user_name, role, action, entity_type, entity_id, result, ip, user_agent, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'success', '127.0.0.1', 'seed', ?, ?)`,
    crypto.randomUUID(), userId, name, role, action, entityType, String(entityId), JSON.stringify(metadata), when.toISOString(),
  );
}

