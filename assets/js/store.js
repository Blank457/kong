const Store = (() => {
  const KEY_TRAINING = 'bdm.training.v1';
  const KEY_SESSIONS = 'bdm.sessions.v1';

  const defaultPlan = [
    { id: 'p1', title: '步法专项', detail: '米字步 6 组 × 1 分钟，组间休息 45 秒' },
    { id: 'p2', title: '多球训练', detail: '后场两点杀球 20 分钟，注意转髋发力' },
    { id: 'p3', title: '网前技术', detail: '搓、放、勾各 50 拍，追求贴网质量' },
    { id: 'p4', title: '核心与体能', detail: '平板支撑 3 组、跳绳 10 分钟、拉伸 10 分钟' },
    { id: 'p5', title: '对抗练习', detail: '半场单打 2 局，重点练反手后场过渡' }
  ];

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* storage unavailable */
    }
  };

  const dateKey = (d = new Date()) =>
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0');

  const todayKey = () => dateKey();

  const getPlan = () => read(KEY_TRAINING, { date: todayKey(), done: [] });
  const savePlan = (plan) => write(KEY_TRAINING, plan);

  const togglePlan = (id) => {
    let plan = getPlan();
    if (plan.date !== todayKey()) plan = { date: todayKey(), done: [] };
    const done = plan.done.includes(id)
      ? plan.done.filter((x) => x !== id)
      : [...plan.done, id];
    savePlan({ date: plan.date, done });
    return done;
  };

  const planProgress = () => {
    const plan = getPlan();
    if (plan.date !== todayKey()) return { done: 0, total: defaultPlan.length };
    return { done: plan.done.length, total: defaultPlan.length };
  };

  const getSessions = () => read(KEY_SESSIONS, []);
  const addSession = (date) => {
    const list = getSessions();
    if (!list.includes(date)) {
      list.push(date);
      write(KEY_SESSIONS, list);
    }
    return list;
  };

  const weekCount = () => {
    const sessions = getSessions();
    const now = new Date();
    const offset = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - offset);
    let count = 0;
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      if (sessions.includes(dateKey(d))) count += 1;
    }
    return count;
  };

  return { defaultPlan, getPlan, togglePlan, planProgress, getSessions, addSession, weekCount };
})();