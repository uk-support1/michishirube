const storageKey = "dots-reflections-v1";
const fields = [
  ["decision", "自分で決めたこと"],
  ["done", "できたこと"],
  ["idea", "工夫や助け"],
];
const $ = (id) => document.getElementById(id);
const maxLength = 280;
function readList(key) {
  let raw = null;
  try {
    raw = localStorage.getItem(key);
    const list = JSON.parse(raw || "[]");
    if (Array.isArray(list)) return list;
  } catch { /* 読めないデータは下で退避する */ }
  // 読めないデータは上書きせず、別のキーに残してから空として扱う
  try { if (raw && !localStorage.getItem(key + "-broken")) localStorage.setItem(key + "-broken", raw); } catch { /* 退避できなくても続ける */ }
  return [];
}
function rawWriteList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); return true; } catch { return false; }
}
// 変更された項目に更新日時を付け、消された項目は「消した印」として覚える（クラウドとの同期で使う）
const tombKey = "dots-tombstones-v1";
function stampChanges(key, list) {
  const before = new Map(readList(key).filter((item) => item && item.id).map((item) => [item.id, item]));
  const same = (a, b) => { const strip = ({ updatedAt, ...rest }) => JSON.stringify(rest); return strip(a) === strip(b); };
  const now = new Date().toISOString();
  list.forEach((item) => {
    const old = before.get(item.id);
    if (!old || !same(old, item)) item.updatedAt = now;
    else if (old.updatedAt) item.updatedAt = old.updatedAt;
    before.delete(item.id);
  });
  const present = new Set(list.map((item) => item.id));
  let stones = readList(tombKey).filter((stone) => !(stone.key === key && present.has(stone.id)));
  before.forEach((old, id) => { stones = stones.filter((stone) => !(stone.key === key && stone.id === id)); stones.push({ id, key, at: now }); });
  rawWriteList(tombKey, stones);
}
function writeList(key, list) {
  stampChanges(key, list);
  const ok = rawWriteList(key, list);
  if (ok) scheduleSync();
  return ok;
}
const getRecords = () => readList(storageKey);
const setRecords = (records) => writeList(storageKey, records);
function cleanRecord(item) {
  if (!item || typeof item.id !== "string" || !item.id || Number.isNaN(new Date(item.createdAt).getTime())) return null;
  const record = { id: item.id, createdAt: new Date(item.createdAt).toISOString() };
  fields.forEach(([id]) => { record[id] = typeof item[id] === "string" ? item[id].slice(0, maxLength) : ""; });
  return fields.some(([id]) => record[id]) ? record : null;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(value));
}
function updateCount() { $("record-count").textContent = getRecords().length; }
function updateCharacters() {
  fields.forEach(([id]) => $(id + "-count").textContent = $(id).value.length);
}
function clearFields() { fields.forEach(([id]) => { $(id).value = ""; }); updateCharacters(); }
function fillRecord(dl, record) {
  dl.replaceChildren();
  fields.forEach(([id, label]) => {
    if (!record[id]) return;
    const dt = document.createElement("dt"); dt.textContent = label;
    const dd = document.createElement("dd"); dd.textContent = record[id];
    dl.append(dt, dd);
  });
}
let revisitId = null;
function renderRevisit(forceNew) {
  const box = $("revisit");
  const today = new Date().toDateString();
  const pool = getRecords().filter((item) => new Date(item.createdAt).toDateString() !== today);
  if (!pool.length) { revisitId = null; box.hidden = true; return; }
  let record = pool.find((item) => item.id === revisitId);
  if (!record || forceNew) {
    const others = pool.length > 1 ? pool.filter((item) => item.id !== revisitId) : pool;
    record = others[Math.floor(Math.random() * others.length)];
  }
  revisitId = record.id;
  $("revisit-time").textContent = formatDate(record.createdAt);
  $("revisit-time").dateTime = record.createdAt;
  fillRecord($("revisit-body"), record);
  $("revisit-next").hidden = pool.length < 2;
  box.hidden = false;
}
let editingId = null;
function buildEditor(record) {
  const form = document.createElement("form"); form.className = "edit-form";
  fields.forEach(([id, label]) => {
    const wrap = document.createElement("label"); wrap.textContent = label;
    const area = document.createElement("textarea"); area.name = id; area.rows = 3; area.maxLength = maxLength; area.value = record[id] || "";
    wrap.append(area); form.append(wrap);
  });
  const row = document.createElement("div"); row.className = "edit-actions";
  const save = document.createElement("button"); save.type = "submit"; save.className = "secondary-button"; save.textContent = "変更を残す";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "secondary-button"; cancel.textContent = "やめる";
  cancel.addEventListener("click", () => { editingId = null; showHistoryMessage(""); renderHistory(); });
  row.append(save, cancel); form.append(row);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = Object.fromEntries(fields.map(([id]) => [id, form.elements[id].value.trim()]));
    if (!Object.values(values).some(Boolean)) { showHistoryMessage("空白にはできません。消したいときは「削除」を使えます。"); return; }
    const records = getRecords();
    const index = records.findIndex((item) => item.id === record.id);
    if (index < 0) { editingId = null; renderHistory(); return; }
    records[index] = { ...records[index], ...values };
    if (!setRecords(records)) { showHistoryMessage("うまく残せませんでした。書いた内容はこの画面に残してあります。"); return; }
    editingId = null; renderHistory(); showHistoryMessage("変更を残しました。");
  });
  return form;
}
function renderHistory() {
  const list = $("history-list");
  const records = getRecords();
  list.replaceChildren();
  if (!records.length) { list.innerHTML = '<p class="history-empty">まだ記録はありません。<br>最初の小さな一歩を残してみましょう。</p>'; renderRevisit(); return; }
  records.forEach((record) => {
    const node = $("history-item-template").content.cloneNode(true);
    node.querySelector("time").textContent = formatDate(record.createdAt);
    node.querySelector("time").dateTime = record.createdAt;
    if (record.id === editingId) {
      node.querySelector("dl").replaceWith(buildEditor(record));
      node.querySelector(".history-item-actions").remove();
    } else {
      fillRecord(node.querySelector("dl"), record);
      node.querySelector(".edit-button").addEventListener("click", () => { editingId = record.id; showHistoryMessage(""); renderHistory(); });
      node.querySelector(".delete-button").addEventListener("click", () => deleteRecord(record));
    }
    list.append(node);
  });
  renderRevisit();
}
function showMessage(box, text, undo) {
  box.replaceChildren(text);
  if (undo) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "undo-button"; button.textContent = "元に戻す";
    button.addEventListener("click", undo);
    box.append(" ", button);
  }
}
const showHistoryMessage = (text, undo) => showMessage($("history-message"), text, undo);
function deleteRecord(record) {
  const records = getRecords();
  const index = records.findIndex((item) => item.id === record.id);
  if (index < 0) return;
  records.splice(index, 1);
  if (!setRecords(records)) { showHistoryMessage("うまく消せませんでした。この端末の保存場所を確認してみてください。"); return; }
  updateCount(); renderHistory();
  showHistoryMessage("記録を1件、消しました。", () => {
    const current = getRecords();
    if (!current.some((item) => item.id === record.id)) current.splice(Math.min(index, current.length), 0, record);
    if (setRecords(current)) { updateCount(); renderHistory(); showHistoryMessage("記録を戻しました。"); }
    else showHistoryMessage("うまく戻せませんでした。");
  });
}
function saveReflection() {
  const record = Object.fromEntries(fields.map(([id]) => [id, $(id).value.trim()]));
  if (!Object.values(record).some(Boolean)) { $("save-message").textContent = "空白のままでも大丈夫。残したいことがある日に、また来てください。"; return; }
  const records = getRecords();
  records.unshift({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...record });
  if (!setRecords(records)) { $("save-message").textContent = "うまく残せませんでした。書いた内容はこの画面に残してあります。保存場所の空きを確認して、もう一度試してみてください。"; return; }
  updateCount(); clearFields();
  $("save-message").textContent = "残しました。今日のあなたが動かした一歩が、ここにあります。";
}
// ---- やりたいこと：一覧と、1件ごとの詳細ページ ----
const wishKey = "dots-wishes-v1";
const kinds = [["do", "やりたいこと"], ["have", "ほしいもの"], ["be", "なりたい自分"]];
const feelings = ["自信", "楽しい", "知識", "つながり", "暮らし"];
const wants = [["", "まだ決めない"], ["5", "とてもやりたい"], ["3", "まあまあやりたい"], ["1", "ちょっとだけ"], ["0", "やったほうが良いけど、やりたくならない"]];
const getWishes = () => readList(wishKey);
const kindLabel = (kind) => (kinds.find(([id]) => id === kind) || kinds[0])[1];
const findWish = (list, id) => list.find((item) => item.id === id);
const wishMessage = (text, undo) => ["wish-message", "wish-detail-message"].forEach((id) => { if ($(id)) showMessage($(id), text, undo); });
let parkedOpen = false;
function writeWishes(list) {
  if (writeList(wishKey, list)) return true;
  wishMessage("うまく残せませんでした。保存場所の空きを確認して、もう一度試してみてください。");
  return false;
}
function changeWishes(change, done) {
  const list = getWishes(); change(list);
  if (!writeWishes(list)) return false;
  renderWishes(); renderDetail();
  if (done) wishMessage(done);
  return true;
}
// 入力中の欄を作り直さないよう、詳細ページの項目は一覧だけを描き直す
function patchWish(id, change, done) {
  const list = getWishes(); const target = findWish(list, id); if (!target) return;
  change(target);
  if (!writeWishes(list)) return;
  renderWishes();
  if (done) wishMessage(done);
}
const openWish = (id) => { location.hash = "wish=" + encodeURIComponent(id); };
function addWish(title) {
  const text = title.trim().slice(0, 80);
  if (!text) { wishMessage("空白のままでも大丈夫。思いついたときに、また置いてください。"); return; }
  changeWishes((list) => list.unshift({ id: crypto.randomUUID(), title: text, createdAt: new Date().toISOString(), kind: "do", want: "", feelings: [], why: "", due: "", parked: false, steps: [] }), "置きました。");
}
function resultForm(wish, step) {
  const form = document.createElement("form"); form.className = "inline-form";
  const input = document.createElement("input"); input.type = "text"; input.maxLength = 140; input.value = step.result || "";
  input.placeholder = "やってみて、どうだった？（一言でOK）"; input.setAttribute("aria-label", "やってみて、どうだったか");
  const save = document.createElement("button"); save.type = "submit"; save.className = "secondary-button"; save.textContent = "残す";
  form.append(input, save);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    changeWishes((list) => { const target = findWish(list, wish.id)?.steps.find((item) => item.id === step.id); if (target) target.result = input.value.trim().slice(0, 140); }, "残しました。やったことと、起きたことがつながりました。");
  });
  return form;
}
function checkStep(wish, step, box) {
  changeWishes((list) => {
    const target = findWish(list, wish.id)?.steps.find((item) => item.id === step.id);
    if (target) target.doneAt = box.checked ? new Date().toISOString() : null;
  }, box.checked ? "消せました。小さくても、あなたが動かした一歩です。" : "戻しました。");
}
function stepLabel(wish, step) {
  const label = document.createElement("label");
  const box = document.createElement("input"); box.type = "checkbox"; box.checked = Boolean(step.doneAt);
  const text = document.createElement("span"); text.textContent = step.text;
  label.append(box, text);
  box.addEventListener("change", () => checkStep(wish, step, box));
  return label;
}
// 段の色：1段目の水色から、虹のように上へ。階段の段数に合わせて割り振る
function levelColor(index, total, saturation, lightness) {
  const t = total > 1 ? index / (total - 1) : 0;
  const hue = Math.round((((195 - t * 235) % 360) + 360) % 360);
  return "hsl(" + hue + ", " + saturation + "%, " + lightness + "%)";
}
function moveStep(wish, step, delta) {
  changeWishes((list) => {
    const steps = findWish(list, wish.id)?.steps; if (!steps) return;
    const from = steps.findIndex((item) => item.id === step.id), to = from + delta;
    if (from < 0 || to < 0 || to >= steps.length) return;
    [steps[from], steps[to]] = [steps[to], steps[from]];
  });
  const again = document.querySelector('[data-step="' + step.id + '"]:not(:disabled)');
  if (again) again.focus();
}
function deleteStep(wish, step) {
  const list = getWishes(), target = findWish(list, wish.id); if (!target) return;
  const index = target.steps.findIndex((item) => item.id === step.id); if (index < 0) return;
  const [removed] = target.steps.splice(index, 1);
  if (!writeWishes(list)) return;
  renderWishes(); renderDetail();
  wishMessage("1段を消しました。", () => {
    const current = getWishes(), back = findWish(current, wish.id);
    if (!back || back.steps.some((item) => item.id === removed.id)) return;
    back.steps.splice(Math.min(index, back.steps.length), 0, removed);
    if (writeWishes(current)) { renderWishes(); renderDetail(); wishMessage("戻しました。"); } else wishMessage("うまく戻せませんでした。");
  });
}
function moveButton(wish, step, delta, symbol, hint, disabled) {
  const button = document.createElement("button"); button.type = "button"; button.className = "move-button";
  button.textContent = symbol; button.disabled = disabled; button.dataset.step = step.id;
  button.setAttribute("aria-label", "「" + step.text + "」を" + hint);
  button.addEventListener("click", () => moveStep(wish, step, delta));
  return button;
}
function stairRow(wish, step, index, total) {
  const li = document.createElement("li"); li.className = "stair" + (step.doneAt ? " done" : "");
  li.style.setProperty("--lv", levelColor(index, total, 80, 72));
  li.style.setProperty("--lv-soft", levelColor(index, total, 90, 94));
  li.style.setProperty("--lv-strong", levelColor(index, total, 65, 38));
  const number = document.createElement("span"); number.className = "stair-no"; number.textContent = index + 1;
  const body = document.createElement("div"); body.className = "stair-body"; body.append(stepLabel(wish, step));
  if (step.doneAt) {
    if (step.result) { const note = document.createElement("p"); note.className = "step-result"; note.textContent = step.result; body.append(note); }
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "link-button";
    edit.textContent = step.result ? "書き直す" : "どうなったかを書く";
    edit.addEventListener("click", () => { edit.replaceWith(resultForm(wish, step)); body.querySelector("input[type=text]").focus(); });
    body.append(edit);
  }
  const move = document.createElement("div"); move.className = "stair-move";
  move.append(
    moveButton(wish, step, 1, "↑", "ひとつ上へ（あとにまわす）", index === total - 1),
    moveButton(wish, step, -1, "↓", "ひとつ下へ（さきにする）", index === 0));
  const del = document.createElement("button"); del.type = "button"; del.className = "move-button del-button"; del.textContent = "×";
  del.setAttribute("aria-label", "「" + step.text + "」を消す");
  del.addEventListener("click", () => deleteStep(wish, step));
  move.append(del);
  li.append(number, body, move);
  return li;
}
function sparkles() {
  const box = document.createElement("div"); box.className = "sparkles"; box.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 16; i += 1) {
    const dot = document.createElement("span");
    dot.style.setProperty("--x", Math.round((i * 37) % 100) + "%"); dot.style.setProperty("--y", Math.round((i * 53) % 90) + "%");
    dot.style.setProperty("--c", levelColor(i, 16, 85, 62)); dot.style.setProperty("--d", (i % 5) * 0.25 + "s");
    box.append(dot);
  }
  return box;
}
function deleteWish(wish, afterDelete) {
  const list = getWishes(); const index = list.findIndex((item) => item.id === wish.id); if (index < 0) return;
  const [removed] = list.splice(index, 1);
  if (!writeWishes(list)) return;
  if (afterDelete) afterDelete();
  renderWishes();
  wishMessage("1件、消しました。", () => {
    const current = getWishes(); if (!findWish(current, removed.id)) current.splice(Math.min(index, current.length), 0, removed);
    if (writeWishes(current)) { renderWishes(); wishMessage("戻しました。"); }
  });
}
// 階段のイラスト：光る段、いまの位置の玉、点線の道、ゴールの旗をSVGで描く。文字は含めない
let svgCount = 0;
function smoothPath(points) {
  if (points.length < 2) return "";
  const f = (point) => point.x.toFixed(1) + " " + point.y.toFixed(1);
  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  let d = "M " + f(points[0]);
  for (let i = 1; i < points.length - 1; i += 1) d += " Q " + f(points[i]) + " " + f(mid(points[i], points[i + 1]));
  return d + " L " + f(points[points.length - 1]);
}
function stairsSvg(wish, width, height, rise) {
  const id = "sv" + (svgCount += 1);
  const n = wish.steps.length;
  const nowIndex = wish.steps.findIndex((step) => !step.doneAt);
  const reached = nowIndex < 0;
  const f = (value) => value.toFixed(1);
  const pad = 6, base = height - 6;
  const sw = Math.min((width - pad - 34) / n, width * 0.17);
  const minRise = rise * 0.3;
  const tops = [], shapes = [];
  wish.steps.forEach((step, i) => {
    const h = n > 1 ? minRise + ((rise - minRise) * i) / (n - 1) : rise * 0.5;
    const x = pad + i * sw, w = sw - 2, y = base - h;
    tops.push({ x: x + w / 2, y: y - 9 });
    const rect = (fill, extra) => '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" rx="3" fill="' + fill + '"' + (extra || "") + '/>';
    if (step.doneAt) shapes.push(rect(levelColor(i, n, 82, 66)));
    else if (i === nowIndex) shapes.push(rect(levelColor(i, n, 82, 70), ' stroke="#23302b" stroke-width="2"'));
    else shapes.push(rect(levelColor(i, n, 72, 87)));
  });
  const flagX = Math.min(pad + n * sw + 8, width - 28);
  const poleTop = base - rise - 16;
  const trail = tops.concat([{ x: flagX, y: poleTop + 8 }]);
  const walked = reached ? trail : trail.slice(0, nowIndex + 1);
  const grad = reached ? "#ffe066,#ffb703 55%,#ff7aa8" : "#ff9a5a,#d9487a 60%,#8a5cf6";
  const star = (cx, cy, r) => '<path class="spark" d="M' + f(cx) + ' ' + f(cy - r) + ' Q' + f(cx) + ' ' + f(cy) + ' ' + f(cx + r) + ' ' + f(cy) + ' Q' + f(cx) + ' ' + f(cy) + ' ' + f(cx) + ' ' + f(cy + r)
    + ' Q' + f(cx) + ' ' + f(cy) + ' ' + f(cx - r) + ' ' + f(cy) + ' Q' + f(cx) + ' ' + f(cy) + ' ' + f(cx) + ' ' + f(cy - r) + 'Z" fill="#ffb703"/>';
  const px = flagX + 1.2, py = poleTop + 3;
  let svg = '<svg class="stairs-svg" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true" focusable="false">'
    + '<defs><linearGradient id="' + id + 'f" x1="0" y1="0" x2="1" y2="1">'
    + grad.split(",").map((stop, i, all) => { const parts = stop.split(" "); return '<stop offset="' + (parts[1] || Math.round((i / (all.length - 1)) * 100) + "%") + '" stop-color="' + parts[0] + '"/>'; }).join("")
    + '</linearGradient></defs>'
    + '<line x1="2" x2="' + (width - 2) + '" y1="' + (base + 2) + '" y2="' + (base + 2) + '" stroke="rgba(35,48,43,.14)" stroke-width="2" stroke-linecap="round"/>'
    + shapes.join("")
    + '<path d="' + smoothPath(trail) + '" fill="none" stroke="rgba(35,48,43,.32)" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="0.1 4.5"/>';
  if (walked.length > 1) svg += '<path d="' + smoothPath(walked) + '" fill="none" stroke="#ee6c4d" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0.1 4.5"/>';
  svg += '<ellipse cx="' + f(flagX) + '" cy="' + (base + 1.5) + '" rx="6.5" ry="1.7" fill="rgba(35,48,43,.2)"/>'
    + '<line x1="' + f(flagX) + '" y1="' + f(base) + '" x2="' + f(flagX) + '" y2="' + f(poleTop) + '" stroke="#3b4a43" stroke-width="2.2" stroke-linecap="round"/>'
    + '<path class="pennant" d="M' + f(px) + ' ' + f(py) + ' C' + f(px + 7) + ' ' + f(py - 3) + ' ' + f(px + 13) + ' ' + f(py + 4) + ' ' + f(px + 22) + ' ' + f(py + 1)
    + ' L' + f(px + 17) + ' ' + f(py + 7.5) + ' L' + f(px + 22) + ' ' + f(py + 14) + ' C' + f(px + 13) + ' ' + f(py + 17) + ' ' + f(px + 7) + ' ' + f(py + 10) + ' ' + f(px) + ' ' + f(py + 13) + 'Z" fill="url(#' + id + 'f)"/>'
    + '<circle cx="' + f(flagX) + '" cy="' + f(poleTop) + '" r="2.8" fill="#ffb703" stroke="#fff" stroke-width="1"/>';
  if (reached && n > 0) svg += star(flagX + 16, poleTop - 4, 4) + star(flagX - 10, poleTop + 8, 3) + star(Math.min(flagX + 26, width - 4), poleTop + 20, 3);
  if (!reached) {
    const mark = tops[nowIndex];
    svg += '<circle class="orb" cx="' + f(mark.x) + '" cy="' + f(mark.y) + '" r="4.2" fill="#23302b" stroke="#fff" stroke-width="1.6"/>';
  }
  return svg + '</svg>';
}
function miniStairs(wish) {
  const box = document.createElement("div"); box.className = "mini-stairs";
  box.innerHTML = stairsSvg(wish, 200, 54, 28);
  return box;
}
function wishCard(wish) {
  const node = document.createElement("article"); node.className = "wish";
  const head = document.createElement("div"); head.className = "wish-head";
  const title = document.createElement("button"); title.type = "button"; title.className = "wish-title"; title.textContent = wish.title;
  title.addEventListener("click", () => openWish(wish.id));
  const chip = document.createElement("span"); chip.className = "chip"; chip.textContent = kindLabel(wish.kind);
  head.append(title, chip); node.append(head);
  const total = wish.steps.length;
  const nowIndex = wish.steps.findIndex((step) => !step.doneAt);
  if (total) {
    const row = document.createElement("div"); row.className = "progress-row";
    const where = document.createElement("span"); where.className = "progress-where";
    where.textContent = nowIndex < 0 ? (wish.reachedAt ? "ゴールにとどきました ✨" : "ぜんぶ消せました") : (nowIndex + 1) + "段目 / 全" + total + "段";
    row.append(miniStairs(wish), where); node.append(row);
  }
  const foot = document.createElement("div"); foot.className = "wish-foot";
  const next = wish.steps.find((step) => !step.doneAt);
  if (next) {
    const label = stepLabel(wish, next); label.classList.add("next-step"); foot.append(label);
  } else {
    const hint = document.createElement("p"); hint.className = "wish-hint";
    hint.textContent = total ? "ひらいて、ふり返ってみる" : "ひらいて、すぐできる小さな一歩を足してみましょう。"; foot.append(hint);
  }
  const open = document.createElement("button"); open.type = "button"; open.className = "link-button"; open.textContent = "ひらく";
  open.addEventListener("click", () => openWish(wish.id));
  foot.append(open); node.append(foot);
  return node;
}
function renderWishes() {
  const list = getWishes();
  const box = $("wish-list"); box.replaceChildren();
  const active = list.filter((item) => !item.parked), parked = list.filter((item) => item.parked);
  if (!list.length) { const empty = document.createElement("p"); empty.className = "wish-empty"; empty.textContent = "まだ何もありません。小さなことでも、まだ形になっていなくても、ここに置いてみましょう。"; box.append(empty); }
  active.forEach((item) => box.append(wishCard(item)));
  if (parked.length) {
    const details = document.createElement("details"); details.className = "parked"; details.open = parkedOpen;
    details.addEventListener("toggle", () => { parkedOpen = details.open; });
    const summary = document.createElement("summary"); summary.textContent = "いまは寝かせているもの（" + parked.length + "）";
    details.append(summary); parked.forEach((item) => details.append(wishCard(item))); box.append(details);
  }
  const total = list.reduce((sum, item) => sum + item.steps.filter((step) => step.doneAt).length, 0);
  $("wish-total").hidden = total === 0;
  $("wish-total").textContent = "これまでに消せた一歩：" + total;
  if ($("backup-reminder") && typeof renderBackupReminder === "function") renderBackupReminder();
}
function field(labelText, control, note) {
  const wrap = document.createElement("div"); wrap.className = "detail-field";
  const label = document.createElement("label"); label.textContent = labelText; label.append(control);
  wrap.append(label);
  if (note) { const p = document.createElement("p"); p.className = "detail-note"; p.textContent = note; wrap.append(p); }
  return wrap;
}
function selectOf(options, value) {
  const select = document.createElement("select");
  options.forEach(([id, text]) => { const option = document.createElement("option"); option.value = id; option.textContent = text; select.append(option); });
  select.value = value; return select;
}
function buildDetail(wish) {
  const page = document.createDocumentFragment();
  const back = document.createElement("a"); back.className = "back-link"; back.href = "#"; back.textContent = "← 一覧にもどる";
  const goal = document.createElement("div"); goal.className = "goal" + (wish.reachedAt ? " reached" : "");
  const goalLabel = document.createElement("span"); goalLabel.className = "goal-label"; goalLabel.textContent = "✦ ゴール";
  const title = document.createElement("input"); title.type = "text"; title.className = "goal-title"; title.maxLength = 80; title.value = wish.title; title.setAttribute("aria-label", "ゴール（やりたいことの名前）");
  title.addEventListener("change", () => { const text = title.value.trim().slice(0, 80); if (!text) { title.value = wish.title; return; } patchWish(wish.id, (item) => { item.title = text; }, "残しました。"); });
  const reach = document.createElement("button"); reach.type = "button"; reach.className = "goal-reach";
  reach.textContent = wish.reachedAt ? "ゴールにとどきました ✨（戻す）" : "ゴールにとどいた！";
  reach.addEventListener("click", () => changeWishes((list) => { const target = findWish(list, wish.id); if (target) target.reachedAt = target.reachedAt ? null : new Date().toISOString(); }, wish.reachedAt ? "戻しました。" : "ゴールにとどきました。ここまで来たのは、あなたの行動です。"));
  const drop = document.createElement("button"); drop.type = "button"; drop.className = "goal-drop"; drop.textContent = "いらなくなった（消す）";
  drop.addEventListener("click", () => deleteWish(wish, () => { location.hash = ""; }));
  const goalRow = document.createElement("div"); goalRow.className = "goal-row"; goalRow.append(reach, drop);
  goal.append(goalLabel, title, goalRow);
  if (wish.reachedAt) goal.append(sparkles());
  const message = document.createElement("p"); message.id = "wish-detail-message"; message.className = "wish-message"; message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");

  let art = null;
  if (wish.steps.length) {
    art = document.createElement("div"); art.className = "stairs-art";
    const nowIndex = wish.steps.findIndex((step) => !step.doneAt);
    const where = document.createElement("span"); where.className = "progress-where";
    where.textContent = nowIndex < 0 ? (wish.reachedAt ? "ゴールにとどきました ✨" : "ぜんぶ消せました") : (nowIndex + 1) + "段目 / 全" + wish.steps.length + "段";
    art.innerHTML = stairsSvg(wish, 320, 112, 76); art.append(where);
  }
  const stairsHead = document.createElement("h3"); stairsHead.textContent = "ゴールへの階段";
  const stairsNote = document.createElement("p"); stairsNote.className = "detail-note";
  stairsNote.textContent = "いちばん下が、さいしょの一段。上へ積み上がって、てっぺんがゴールです。足した一段は、いちばん上に積まれます。↑↓で順番を入れ替えられます。今日、今すぐできるくらい小さく。前の夜に思い浮かべて、気が進まなければ、もっと小さくして大丈夫です。";
  const form = document.createElement("form"); form.className = "inline-form";
  const input = document.createElement("input"); input.type = "text"; input.maxLength = 80; input.placeholder = "一段を足す（例：靴を履く）"; input.setAttribute("aria-label", "一段を足す");
  const add = document.createElement("button"); add.type = "submit"; add.className = "secondary-button"; add.textContent = "足す";
  form.append(input, add);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim().slice(0, 80); if (!text) return;
    changeWishes((list) => findWish(list, wish.id)?.steps.push({ id: crypto.randomUUID(), text, doneAt: null, result: "" }));
  });
  const stairs = document.createElement("ul"); stairs.className = "stairs";
  const total = wish.steps.length;
  wish.steps.map((step, index) => stairRow(wish, step, index, total)).reverse().forEach((row) => stairs.append(row));
  const start = document.createElement("li"); start.className = "stairs-start"; start.textContent = total ? "ここから、はじまり" : "まだ一段もありません。最初の一段を、上の欄から足してみましょう。";
  stairs.append(start);

  const kind = selectOf(kinds, wish.kind || "do");
  kind.addEventListener("change", () => patchWish(wish.id, (item) => { item.kind = kind.value; }, "残しました。"));
  const want = selectOf(wants, wish.want || "");
  want.addEventListener("change", () => patchWish(wish.id, (item) => { item.want = want.value; }, "残しました。"));
  const why = document.createElement("textarea"); why.rows = 3; why.maxLength = 280; why.value = wish.why || ""; why.placeholder = "例：外の空気を吸うと、気持ちが少し軽くなるから";
  why.addEventListener("change", () => patchWish(wish.id, (item) => { item.why = why.value.trim(); }, "残しました。"));
  const due = document.createElement("input"); due.type = "date"; due.value = wish.due || "";
  due.addEventListener("change", () => patchWish(wish.id, (item) => { item.due = due.value; }, "残しました。"));
  const feelWrap = document.createElement("fieldset"); feelWrap.className = "feelings";
  const legend = document.createElement("legend"); legend.textContent = "できたら、どんな感じがしそう？"; feelWrap.append(legend);
  feelings.forEach((name) => {
    const label = document.createElement("label"); label.className = "feeling";
    const box = document.createElement("input"); box.type = "checkbox"; box.checked = (wish.feelings || []).includes(name);
    box.addEventListener("change", () => patchWish(wish.id, (item) => { const set = new Set(item.feelings || []); if (box.checked) set.add(name); else set.delete(name); item.feelings = [...set]; }, "残しました。"));
    label.append(box, name); feelWrap.append(label);
  });
  const actions = document.createElement("div"); actions.className = "wish-actions";
  const park = document.createElement("button"); park.type = "button"; park.className = "link-button";
  park.textContent = wish.parked ? "また取り出す" : "いまは寝かせておく";
  park.addEventListener("click", () => changeWishes((list) => { const target = findWish(list, wish.id); if (target) target.parked = !target.parked; }, wish.parked ? "取り出しました。" : "寝かせました。いつでも戻せます。"));
  actions.append(park);
  const moreHead = document.createElement("h3"); moreHead.textContent = "このゴールについて";
  page.append(back, goal, message, ...(art ? [art] : []), stairsHead, stairsNote, form, stairs, moreHead,
    field("種類", kind),
    field("やりたい気持ちの強さ", want, "「やりたくならない」を選んでも大丈夫。いまの正直な気持ちでOKです。"),
    field("なぜ、それをしたい？", why, "わからなければ空白で大丈夫。あとで、ふと思いついたときに。"),
    feelWrap,
    field("いつごろ？（決めなくてもOK）", due, "余裕のある日で大丈夫。間に合わなくても、日付を変えればいいだけです。"),
    actions);
  return page;
}
function renderDetail() {
  const box = $("wish-detail");
  const match = location.hash.match(/^#wish=(.+)$/);
  const wish = match && findWish(getWishes(), decodeURIComponent(match[1]));
  if (!wish) { box.replaceChildren(); return false; }
  box.replaceChildren(buildDetail(wish));
  return true;
}
function renderRoute() {
  const shown = renderDetail();
  document.querySelector("main").classList.toggle("detail-open", shown);
  if (!shown && location.hash.startsWith("#wish=")) history.replaceState(null, "", location.pathname + location.search);
  window.scrollTo(0, 0);
}

// ---- 控え：すべての記録（振り返りとやりたいこと）を書き出す・読み込む ----
const isDate = (value) => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
function cleanWish(item) {
  if (!item || typeof item.id !== "string" || !item.id || typeof item.title !== "string" || !item.title.trim()) return null;
  const steps = (Array.isArray(item.steps) ? item.steps : []).map((step) => (step && typeof step.text === "string" && step.text.trim()
    ? { id: typeof step.id === "string" && step.id ? step.id : crypto.randomUUID(), text: step.text.slice(0, 80), doneAt: isDate(step.doneAt) ? new Date(step.doneAt).toISOString() : null, result: typeof step.result === "string" ? step.result.slice(0, 140) : "" }
    : null)).filter(Boolean);
  return {
    id: item.id, title: item.title.trim().slice(0, 80), createdAt: isDate(item.createdAt) ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
    kind: kinds.some(([id]) => id === item.kind) ? item.kind : "do", want: ["", "0", "1", "3", "5"].includes(String(item.want ?? "")) ? String(item.want ?? "") : "",
    feelings: Array.isArray(item.feelings) ? item.feelings.filter((name) => feelings.includes(name)) : [], why: typeof item.why === "string" ? item.why.slice(0, 280) : "",
    due: typeof item.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.due) ? item.due : "", parked: Boolean(item.parked),
    reachedAt: isDate(item.reachedAt) ? new Date(item.reachedAt).toISOString() : null, steps,
  };
}
const backupText = () => JSON.stringify({ app: "dots", version: 2, exportedAt: new Date().toISOString(), reflections: getRecords(), wishes: getWishes() }, null, 2);
// 受け取った内容を、今ある記録に足す（同じidは今ある方を残し、何も消さない）
function applyBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("parse"); }
  const incomingRecords = Array.isArray(data) ? data : Array.isArray(data?.reflections) ? data.reflections : null;
  const incomingWishes = Array.isArray(data?.wishes) ? data.wishes : null;
  if (!incomingRecords && !incomingWishes) throw new Error("shape");
  const records = getRecords(), known = new Set(records.map((item) => item.id));
  const newRecords = (incomingRecords || []).map(cleanRecord).filter((item, index, all) => item && !known.has(item.id) && all.findIndex((x) => x && x.id === item.id) === index);
  const wishes = getWishes(), knownWishes = new Set(wishes.map((item) => item.id));
  const newWishes = (incomingWishes || []).map(cleanWish).filter((item, index, all) => item && !knownWishes.has(item.id) && all.findIndex((x) => x && x.id === item.id) === index);
  if (!setRecords([...newRecords, ...records].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))) || !writeList(wishKey, [...wishes, ...newWishes])) throw new Error("write");
  updateCount(); renderHistory(); renderWishes(); renderRoute();
  return { records: newRecords.length, wishes: newWishes.length };
}
function importMessage(error, counts) {
  if (error) return error.message === "write" ? "うまく読み込めませんでした。保存場所の空きを確認してみてください。" : "みちしるべの記録として読み込めませんでした。今ある記録は変わっていません。";
  return counts.records || counts.wishes ? "読み込みました。（振り返り " + counts.records + "件、やりたいこと " + counts.wishes + "件）" : "新しく加わる記録はありませんでした。";
}
function exportRecords() {
  const blob = new Blob([backupText()], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "michishirube-backup.json"; link.click(); URL.revokeObjectURL(link.href); markBackup();
}
function importRecords(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { try { showHistoryMessage(importMessage(null, applyBackup(reader.result))); } catch (error) { showHistoryMessage(importMessage(error)); } };
  reader.readAsText(file); event.target.value = "";
}
async function copyBackup() {
  const text = backupText(), area = $("backup-text");
  try { await navigator.clipboard.writeText(text); markBackup(); showHistoryMessage("すべての記録をコピーしました。移したい先で、貼り付けて読み込んでください。"); }
  catch { area.value = text; area.focus(); area.select(); showHistoryMessage("自動でコピーできませんでした。下の欄に出したので、全体を選んでコピーしてください。"); }
}
function pasteBackup() {
  const area = $("backup-text");
  try { showHistoryMessage(importMessage(null, applyBackup(area.value))); area.value = ""; } catch (error) { showHistoryMessage(importMessage(error)); }
}
// ---- 消えにくくする：ブラウザへの保存のお願いと、控えのお知らせ ----
const backupKey = "dots-backup-at";
function markBackup() { try { localStorage.setItem(backupKey, String(Date.now())); } catch { /* 覚えられなくても続ける */ } renderBackupReminder(); }
function renderBackupReminder() {
  const box = $("backup-reminder");
  const list = [...getWishes(), ...getRecords()];
  const oldest = Math.min(...list.map((item) => new Date(item.createdAt).getTime()).filter((time) => !Number.isNaN(time)));
  let last = 0; try { last = Number(localStorage.getItem(backupKey)) || 0; } catch { /* 読めなければ未保存として扱う */ }
  const day = 24 * 60 * 60 * 1000;
  const due = list.length > 0 && Date.now() - oldest >= day && Date.now() - last >= 7 * day;
  box.hidden = !due;
  if (!due) return;
  box.replaceChildren(last ? "控えを残してから、しばらくたちました。ときどき残しておくと、記録を失いにくくなります。" : "まだ控えを残していません。残しておくと、記録を失いにくくなります。", " ");
  const button = document.createElement("button"); button.type = "button"; button.className = "link-button"; button.textContent = "控えを残す";
  button.addEventListener("click", () => { showHistoryMessage(""); renderHistory(); $("history-dialog").showModal(); $("copy-backup").focus(); });
  box.append(button);
}
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* 対応していなければ何もしない */ }
// ---- クラウド保存：端末に保存したまま、あなたのClaudeアカウントの保管場所と同期する ----
// 使えるのは、クラウド保存つきで公開された画面だけ。使えない場合は、これまでどおり端末だけに保存する
const cloud = { coll: null, running: false, again: false, timer: null, retry: 0 };
const syncKinds = () => [["record", storageKey], ["wish", wishKey]];
const timeOf = (value) => Date.parse(value) || 0;
const docKey = (kind, id) => (kind === "wish" ? "w-" : "r-") + id.replace(/[^A-Za-z0-9_\-.~:@+]/g, "_").slice(0, 150);
function setSyncStatus(state) {
  const note = $("sync-status"), data = document.querySelector(".data-note");
  const texts = {
    off: "", syncing: "☁ 同期しています…", error: "☁ クラウドにつなげませんでした。この端末には保存されています。あとで自動でもう一度試します。",
    ok: "☁ クラウドに保存済み（" + new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) + "）",
  };
  if (note) { note.hidden = state === "off"; note.textContent = texts[state] || ""; }
  if (data) data.textContent = state === "off"
    ? "記録はこの端末のブラウザ内だけに保存されます。ブラウザのデータを消すと記録も消えるので、ときどき「すべての記録をコピー」で控えを残しておくと安心です（振り返りもやりたいことも入ります）。"
    : "記録は、この端末と、あなたのClaudeアカウントのクラウド（あなただけが見られる保管場所）に保存されます。同じアカウントで開けば、別の端末やブラウザでも同じ記録が出ます。";
}
function scheduleSync(delay) {
  if (!cloud.coll) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(syncNow, delay === undefined ? 1500 : delay);
}
async function syncNow() {
  if (!cloud.coll) return;
  if (cloud.running) { cloud.again = true; return; }
  cloud.running = true; setSyncStatus("syncing");
  try { await runSync(); cloud.retry = 0; setSyncStatus("ok"); }
  catch { setSyncStatus("error"); if (cloud.retry < 3) { cloud.retry += 1; scheduleSync(30000); } }
  finally { cloud.running = false; if (cloud.again) { cloud.again = false; scheduleSync(500); } }
}
// 新しい方を残す。クラウドとこの端末の両方にあるものは、更新日時が新しい方を採用し、消した印も同じ扱いにする
async function runSync() {
  const snap = await cloud.coll.get();
  const remote = new Map();
  snap.docs.forEach((doc) => { const body = doc.data(); if (body && typeof body.id === "string" && (body.kind === "wish" || body.kind === "record")) remote.set(body.kind + ":" + body.id, body); });
  const pushes = [];
  let stones = readList(tombKey), keptStones = [], changed = false;
  syncKinds().forEach(([kind, key]) => {
    const local = new Map(readList(key).filter((item) => item && item.id).map((item) => [item.id, item]));
    const mine = new Map(stones.filter((stone) => stone.key === key).map((stone) => [stone.id, stone]));
    const ids = new Set([...local.keys(), ...mine.keys(), ...[...remote.keys()].filter((name) => name.startsWith(kind + ":")).map((name) => name.slice(kind.length + 1))]);
    const next = [];
    ids.forEach((id) => {
      const item = local.get(id), stone = mine.get(id), far = remote.get(kind + ":" + id);
      const lt = item ? timeOf(item.updatedAt || item.createdAt) : -1, tt = stone ? timeOf(stone.at) : -1, rt = far ? timeOf(far.updatedAt) : -1;
      const best = Math.max(lt, tt);
      if (far && rt > best) {
        if (!far.deleted && far.item) next.push({ ...JSON.parse(JSON.stringify(far.item)), updatedAt: far.updatedAt });
      } else if (best > rt) {
        if (item && lt >= tt) { const stamped = item.updatedAt || item.createdAt; next.push({ ...item, updatedAt: stamped }); pushes.push([docKey(kind, id), { kind, id, updatedAt: stamped, deleted: false, item: { ...item, updatedAt: stamped } }]); }
        else { keptStones.push(stone); pushes.push([docKey(kind, id), { kind, id, updatedAt: stone.at, deleted: true, item: null }]); }
      } else if (item && lt >= tt) next.push(item);
      else if (stone) keptStones.push(stone);
    });
    next.sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
    if (JSON.stringify(next) !== JSON.stringify(readList(key))) { rawWriteList(key, next); changed = true; }
  });
  if (JSON.stringify(keptStones) !== JSON.stringify(stones)) rawWriteList(tombKey, keptStones);
  for (const [name, body] of pushes) await cloud.coll.doc(name).set(body);
  if (changed) {
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest("#wish-detail");
    updateCount(); renderHistory(); renderWishes(); renderRevisit();
    if (!typing) { const shown = renderDetail(); document.querySelector("main").classList.toggle("detail-open", shown); }
  }
}
async function startCloud() {
  try {
    if (!window.claude || typeof window.claude.use !== "function") return;
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    const uid = user ? await user.id() : null;
    if (!db || !uid) return;
    cloud.coll = db.collection("data/users/" + uid);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleSync(300); });
    await syncNow();
  } catch { cloud.coll = null; setSyncStatus("off"); }
}
// ---- はじめの画面：ホーム画面に追加してから、はじめる ----
// iPhoneでは、ホーム画面に追加したアプリは、Safariとは別の保存場所になる。追加の前に書いた記録は、引き継がれない。
// だから、最初に追加の手順を見せ、追加したアプリを開いてから、プロフィールとスタートに進む
const welcomeKey = "dots-welcome-v1", profileKey = "dots-profile-v1";
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; addInstallButton(); });
const inFrame = () => { try { return window.self !== window.top; } catch { return true; } };
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
function getNickname() { try { return localStorage.getItem(profileKey) || ""; } catch { return ""; } }
function setNickname(name) { try { if (name) localStorage.setItem(profileKey, name); else localStorage.removeItem(profileKey); } catch { /* 保存できなくても続ける */ } renderGreeting(); }
function renderGreeting() {
  const name = getNickname(), box = $("greeting");
  box.hidden = !name; box.textContent = name ? name + "さん、今日もようこそ。" : "";
  $("nickname-input").value = name;
}
function markWelcomeDone() { try { localStorage.setItem(welcomeKey, "1"); } catch { /* 覚えられなくても続ける */ } }
function closeWelcome() { $("welcome").hidden = true; document.body.style.overflow = ""; }
function openWelcome() { $("welcome").hidden = false; document.body.style.overflow = "hidden"; $("welcome-card").scrollTop = 0; }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
function showInstallGuide() {
  const card = $("welcome-card"); card.replaceChildren();
  const share = '<svg class="share-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const steps = [
    ["画面の下（または上）の「共有」ボタン " + share + " をタップします"],
    ["メニューを下へすすみ、「ホーム画面に追加」をえらびます"],
    ["右上の「追加」をタップします"],
    ["ホーム画面にできた「みちしるべ」から、開きなおします"],
  ];
  const list = el("ol", "guide-steps");
  steps.forEach(([html], index) => { const li = el("li", "guide-step"); li.append(el("span", "guide-no", String(index + 1))); const text = el("span"); text.innerHTML = html; li.append(text); list.append(li); });
  const skip = el("button", "link-button", "このまま、この画面ではじめる");
  skip.type = "button"; skip.addEventListener("click", showProfileStep);
  card.append(el("p", "step", "はじめる前に"), el("h2", "", "ホーム画面に追加してから、はじめましょう"),
    el("p", "welcome-lead", "ホーム画面に追加すると、アプリのように開けて、書いた記録も安全に保ちやすくなります。"), list,
    el("p", "welcome-caution", "※ この画面で書いた記録は、ホーム画面のアプリには引き継がれません。追加してから、書きはじめてください。"), skip);
  openWelcome();
}
function showProfileStep() {
  const card = $("welcome-card"); card.replaceChildren();
  const label = el("label", "", "ニックネーム（あいさつに使います）"); label.setAttribute("for", "welcome-nickname");
  const input = el("input"); input.id = "welcome-nickname"; input.type = "text"; input.maxLength = 20; input.placeholder = "空白でも大丈夫です"; input.value = getNickname();
  const note = el("p", "welcome-note", "この端末の中にだけ保存されます。あとから、いつでも変えられます。");
  const start = el("button", "primary-button", "はじめる"); start.type = "button";
  start.addEventListener("click", () => { const name = input.value.trim(); if (name) setNickname(name); markWelcomeDone(); closeWelcome(); });
  card.append(el("p", "step", "ようこそ"), el("h2", "", "自分にも、できることがある。"),
    el("p", "welcome-lead", "大きな成果でなくて大丈夫。小さな一歩から、はじめましょう。"), label, input, note);
  card.append(start);
  addInstallButton();
  openWelcome(); input.focus();
}
// Android（Chrome）の「インストール」ボタン。案内が届いたとき、はじめの画面のプロフィールの段階が出ていれば足す
function addInstallButton() {
  const card = $("welcome-card");
  if (!installPrompt || $("welcome").hidden || !card.querySelector("#welcome-nickname") || card.querySelector(".install-button")) return;
  const install = el("button", "secondary-button install-button", "ホーム画面に追加（インストール）"); install.type = "button";
  install.addEventListener("click", async () => { try { await installPrompt.prompt(); } catch { /* 使えなければ何もしない */ } installPrompt = null; install.remove(); });
  card.insertBefore(install, card.querySelector(".primary-button"));
}
function startWelcome() {
  renderGreeting();
  let done = false; try { done = Boolean(localStorage.getItem(welcomeKey)); } catch { done = true; }
  if (done || inFrame()) return;
  if (getWishes().length || getRecords().length) { markWelcomeDone(); return; }
  if (isIOS() && !isStandalone() && location.protocol.startsWith("http")) showInstallGuide(); else showProfileStep();
}
$("today-label").textContent = formatDate(new Date());
fields.forEach(([id]) => $(id).addEventListener("input", updateCharacters));
$("save-record").addEventListener("click", saveReflection);
$("show-history").addEventListener("click", () => { editingId = null; showHistoryMessage(""); renderHistory(); $("history-dialog").showModal(); });
$("close-history").addEventListener("click", () => $("history-dialog").close());
$("export-records").addEventListener("click", exportRecords);
$("import-records").addEventListener("change", importRecords);
$("nickname-save").addEventListener("click", () => { setNickname($("nickname-input").value.trim()); showHistoryMessage("ニックネームを変えました。"); });
$("copy-backup").addEventListener("click", copyBackup);
$("paste-backup").addEventListener("click", pasteBackup);
$("revisit-next").addEventListener("click", () => renderRevisit(true));
$("wish-form").addEventListener("submit", (event) => { event.preventDefault(); addWish($("wish-input").value); $("wish-input").value = ""; });
window.addEventListener("hashchange", renderRoute);
renderWishes(); renderRoute(); renderBackupReminder(); setSyncStatus("off");
updateCount(); updateCharacters(); renderRevisit();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* 登録できなくてもアプリは使える */ });
}
startWelcome();
startCloud();
