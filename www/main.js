(function () {
  'use strict';

  var KEY = 'billsplit_v2';
  var OLD_KEY = 'billsplit_v1';
  var data = { trips: [], currentId: null };
  var editingId = null;
  var shareText = '';

  // ---------- हेल्पर ----------
  function $(id) { return document.getElementById(id); }
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function money(n) {
    var r = round2(n);
    return '₹' + ((r % 1 === 0) ? String(r) : r.toFixed(2));
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function makeTrip(name) { return { id: newId(), name: name, people: [], expenses: [], payments: [] }; }

  function T() {
    for (var i = 0; i < data.trips.length; i++) if (data.trips[i].id === data.currentId) return data.trips[i];
    return data.trips[0];
  }
  function personName(id) {
    var p = T().people;
    for (var i = 0; i < p.length; i++) if (p[i].id === id) return p[i].name;
    return '?';
  }
  function tripTotal(t) { return t.expenses.reduce(function (s, e) { return s + e.amount; }, 0); }

  // ---------- सेव / लोड ----------
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && Array.isArray(d.trips) && d.trips.length) data = d;
      } else {
        var old = localStorage.getItem(OLD_KEY);
        if (old) {
          var o = JSON.parse(old);
          if (o && Array.isArray(o.people) && Array.isArray(o.expenses)) {
            var t = makeTrip('मेरी ट्रिप');
            t.people = o.people;
            t.expenses = o.expenses;
            data.trips = [t];
            data.currentId = t.id;
          }
        }
      }
    } catch (e) { /* खाली से शुरू */ }
    if (!data.trips.length) {
      var first = makeTrip('मेरी ट्रिप');
      data.trips.push(first);
      data.currentId = first.id;
    }
    data.currentId = T().id;
    data.trips.forEach(function (t) { if (!Array.isArray(t.payments)) t.payments = []; });
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  // ---------- स्क्रीन बदलना ----------
  function setView(name) {
    $('tripView').hidden = name !== 'trip';
    $('resultView').hidden = name !== 'result';
    $('tripsView').hidden = name !== 'trips';
    $('tripsBtn').hidden = name === 'trips';
    window.scrollTo(0, 0);
  }

  // ---------- दोस्त ----------
  function addPerson() {
    var inp = $('personInput');
    var name = inp.value.trim();
    if (!name) return;
    var t = T();
    var dup = t.people.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
    if (dup) { alert('ये नाम पहले से है'); return; }
    t.people.push({ id: newId(), name: name });
    inp.value = '';
    save();
    renderPeople();
    renderSplitChecks();
  }

  function removePerson(id) {
    var t = T();
    var used = t.expenses.some(function (e) { return e.payer === id || e.split.indexOf(id) !== -1; }) ||
      t.payments.some(function (p) { return p.from === id || p.to === id; });
    if (used) { alert('इसके नाम पर खर्चे या पेमेंट हैं। पहले वो हटाओ।'); return; }
    t.people = t.people.filter(function (p) { return p.id !== id; });
    save();
    renderPeople();
    renderSplitChecks();
  }

  function renderPeople() {
    var t = T();
    $('peopleList').innerHTML = t.people.map(function (p) {
      return '<span class="chip">' + esc(p.name) +
        '<button data-del-person="' + p.id + '" aria-label="हटाओ">×</button></span>';
    }).join('') || '<p class="empty">पहले सबके नाम जोड़ो, अपना भी।</p>';

    var sel = $('payerSelect');
    var cur = sel.value;
    sel.innerHTML = t.people.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
    }).join('');
    if (cur) sel.value = cur;
    if (sel.selectedIndex < 0 && sel.options.length) sel.selectedIndex = 0;
  }

  function renderSplitChecks() {
    var prev = {};
    Array.prototype.forEach.call(document.querySelectorAll('#splitList input'), function (c) {
      prev[c.value] = c.checked;
    });
    $('splitList').innerHTML = T().people.map(function (p) {
      var on = (p.id in prev) ? prev[p.id] : true;
      return '<label><input type="checkbox" value="' + p.id + '"' + (on ? ' checked' : '') + '> ' + esc(p.name) + '</label>';
    }).join('');
  }

  // ---------- खर्चा: जोड़ना और बदलना ----------
  function resetForm() {
    editingId = null;
    $('titleInput').value = '';
    $('amountInput').value = '';
    $('formTitle').textContent = 'खर्चा जोड़ो';
    $('addExpenseBtn').textContent = 'खर्चा सेव करो';
    $('cancelEditBtn').hidden = true;
    Array.prototype.forEach.call(document.querySelectorAll('#splitList input'), function (c) { c.checked = true; });
  }

  function startEdit(id) {
    var t = T();
    var e = null;
    for (var i = 0; i < t.expenses.length; i++) if (t.expenses[i].id === id) e = t.expenses[i];
    if (!e) return;
    editingId = id;
    $('titleInput').value = e.title;
    $('amountInput').value = e.amount;
    $('payerSelect').value = e.payer;
    Array.prototype.forEach.call(document.querySelectorAll('#splitList input'), function (c) {
      c.checked = e.split.indexOf(c.value) !== -1;
    });
    $('formTitle').textContent = 'खर्चा बदलो';
    $('addExpenseBtn').textContent = 'बदलाव सेव करो';
    $('cancelEditBtn').hidden = false;
    renderExpenses();
    try { $('formBlock').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err) { window.scrollTo(0, 0); }
  }

  function saveExpense() {
    var t = T();
    var title = $('titleInput').value.trim();
    var amount = parseFloat($('amountInput').value);
    var payer = $('payerSelect').value;
    var split = Array.prototype.filter.call(document.querySelectorAll('#splitList input'), function (c) { return c.checked; })
      .map(function (c) { return c.value; });

    if (t.people.length < 2) { alert('कम से कम 2 लोग जोड़ो'); return; }
    if (!title) { alert('खर्चे का टाइटल लिखो, जैसे चाय'); return; }
    if (!(amount > 0)) { alert('सही रकम डालो'); return; }
    if (!payer) { alert('बताओ पैसे किसने दिए'); return; }
    if (split.length === 0) { alert('कम से कम एक आदमी चुनो जिसके बीच बँटेगा'); return; }

    if (editingId) {
      t.expenses.forEach(function (e) {
        if (e.id === editingId) { e.title = title; e.amount = amount; e.payer = payer; e.split = split; }
      });
    } else {
      t.expenses.push({ id: newId(), title: title, amount: amount, payer: payer, split: split });
    }
    save();
    resetForm();
    renderExpenses();
    $('titleInput').focus();
  }

  function removeExpense(id) {
    if (!confirm('ये खर्चा हटा दें?')) return;
    var t = T();
    t.expenses = t.expenses.filter(function (e) { return e.id !== id; });
    save();
    if (editingId === id) resetForm();
    renderExpenses();
  }

  function renderExpenses() {
    var t = T();
    $('totalTag').textContent = t.expenses.length ? 'कुल ' + money(tripTotal(t)) : '';
    if (!t.expenses.length) {
      $('expenseList').innerHTML = '<p class="empty">अभी कोई खर्चा नहीं जुड़ा।</p>';
      return;
    }
    $('expenseList').innerHTML = t.expenses.map(function (e) {
      return '<div class="exp' + (e.id === editingId ? ' editing' : '') + '"><div><div>' + esc(e.title) + '</div>' +
        '<small>' + esc(personName(e.payer)) + ' ने दिए</small></div>' +
        '<div class="act"><span class="amt">' + money(e.amount) + '</span>' +
        '<button class="edit" data-edit-exp="' + e.id + '">बदलो</button>' +
        '<button class="del" data-del-exp="' + e.id + '" aria-label="खर्चा हटाओ">×</button></div></div>';
    }).join('');
  }

  // ---------- हिसाब ----------
  function renderResult() {
    var t = T();
    var net = {};
    t.people.forEach(function (p) { net[p.id] = 0; });
    var cards = '';

    t.expenses.forEach(function (e) {
      var share = e.amount / e.split.length;
      net[e.payer] += e.amount;
      e.split.forEach(function (id) { net[id] -= share; });

      var rows = e.split.filter(function (id) { return id !== e.payer; }).map(function (id) {
        return '<div class="owe-row"><span>' + esc(personName(id)) + '</span><b>' + money(share) + '</b></div>';
      }).join('');

      cards += '<div class="card">' +
        '<div class="head"><span>' + esc(personName(e.payer)) + '</span><span>' + money(e.amount) + '</span></div>' +
        '<div class="sub">' + esc(e.title) + ', हर हिस्सा ' + money(share) + '</div>' +
        (rows || '<p class="empty">बाकी किसी को कुछ नहीं देना।</p>') +
        '</div>';
    });

    // जो पेमेंट हो चुके हैं उन्हें हिसाब में जोड़ो
    t.payments.forEach(function (p) {
      if (p.from in net) net[p.from] += p.amt;
      if (p.to in net) net[p.to] -= p.amt;
    });

    var debtors = [], creditors = [];
    t.people.forEach(function (p) {
      var v = round2(net[p.id]);
      if (v < -0.009) debtors.push({ id: p.id, amt: -v });
      else if (v > 0.009) creditors.push({ id: p.id, amt: v });
    });
    debtors.sort(function (a, b) { return b.amt - a.amt; });
    creditors.sort(function (a, b) { return b.amt - a.amt; });

    var settle = '';
    var shareLines = [];
    var i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      var pay = round2(Math.min(debtors[i].amt, creditors[j].amt));
      if (pay > 0.009) {
        var fromId = debtors[i].id, toId = creditors[j].id;
        shareLines.push('• ' + personName(fromId) + ' → ' + personName(toId) + ' को ' + money(pay));
        settle += '<div class="settle"><div>' + esc(personName(fromId)) + ' → <b>' + esc(personName(toId)) +
          '</b> को ' + money(pay) + ' दे</div>' +
          '<button class="pay" data-pay="' + fromId + '|' + toId + '|' + pay + '">पेमेंट हो गया</button></div>';
      }
      debtors[i].amt -= pay;
      creditors[j].amt -= pay;
      if (debtors[i].amt < 0.01) i++;
      if (creditors[j].amt < 0.01) j++;
    }

    var netRows = t.people.map(function (p) {
      var v = round2(net[p.id]);
      var cls = v > 0 ? 'plus' : (v < 0 ? 'minus' : '');
      var txt = v > 0 ? money(v) + ' वापस मिलेंगे' : (v < 0 ? money(-v) + ' देने हैं' : 'हिसाब बराबर');
      return '<div class="net"><span>' + esc(p.name) + '</span><span class="' + cls + '">' + txt + '</span></div>';
    }).join('');

    var doneHtml = '';
    var doneLines = [];
    if (t.payments.length) {
      doneHtml = '<h2 class="sec-title">हो चुके पेमेंट</h2><div class="card">' +
        t.payments.map(function (p) {
          doneLines.push('✔ ' + personName(p.from) + ' ने ' + personName(p.to) + ' को ' + money(p.amt) + ' दे दिए');
          return '<div class="settle"><div>' + esc(personName(p.from)) + ' ने <b>' + esc(personName(p.to)) +
            '</b> को ' + money(p.amt) + ' दिए</div>' +
            '<button class="pay undo" data-unpay="' + p.id + '">वापस लो</button></div>';
        }).join('') + '</div>';
    }

    var expLines = t.expenses.map(function (e) {
      return '• ' + e.title + ' ' + money(e.amount) + ' (' + personName(e.payer) + ' ने दिए)';
    });
    shareText = '🧾 ' + t.name + ' का हिसाब\n\nखर्चे:\n' + expLines.join('\n') +
      '\n\nकुल खर्चा: ' + money(tripTotal(t)) +
      '\n\nअभी देना बाकी:\n' + (shareLines.length ? shareLines.join('\n') : 'सब बराबर है') +
      (doneLines.length ? '\n\nहो चुके पेमेंट:\n' + doneLines.join('\n') : '');

    $('resultBody').innerHTML =
      '<button id="shareBtn" class="btn big">हिसाब शेयर करो</button>' +
      '<h2 class="sec-title">सीधा हिसाब, कम से कम लेन-देन में</h2>' +
      '<div class="card">' + (settle || '<p class="empty">सब बराबर है, किसी को कुछ नहीं देना।</p>') + '</div>' +
      doneHtml +
      '<h2 class="sec-title">हर आदमी का कुल (अभी बाकी)</h2>' +
      '<div class="card">' + netRows + '</div>' +
      '<h2 class="sec-title">किसने दिया, किसको कितना देना है</h2>' + cards;
  }

  function showResult() {
    if (!T().expenses.length) { alert('पहले कोई खर्चा जोड़ो'); return; }
    renderResult();
    setView('result');
  }

  function markPaid(val) {
    var parts = val.split('|');
    var amt = parseFloat(parts[2]);
    if (!(amt > 0)) return;
    T().payments.push({ id: newId(), from: parts[0], to: parts[1], amt: amt });
    save();
    renderResult();
  }

  function undoPaid(id) {
    var t = T();
    t.payments = t.payments.filter(function (p) { return p.id !== id; });
    save();
    renderResult();
  }

  function shareResult() {
    if (navigator.share) {
      navigator.share({ title: T().name + ' का हिसाब', text: shareText }).catch(function () { /* रद्द किया */ });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).then(function () {
        alert('हिसाब कॉपी हो गया, अब कहीं भी पेस्ट करो');
      }, function () { prompt('इसे कॉपी करो:', shareText); });
    } else {
      prompt('इसे कॉपी करो:', shareText);
    }
  }

  // ---------- कई ट्रिप ----------
  function renderTrips() {
    $('tripsList').innerHTML = data.trips.map(function (t) {
      var cur = t.id === data.currentId;
      return '<div class="trow' + (cur ? ' cur' : '') + '">' +
        '<button class="topen" data-open-trip="' + t.id + '"><span>' + esc(t.name) + (cur ? ' (अभी खुली)' : '') + '</span>' +
        '<small>' + t.people.length + ' लोग, ' + t.expenses.length + ' खर्चे, कुल ' + money(tripTotal(t)) + '</small></button>' +
        '<button class="del" data-del-trip="' + t.id + '" aria-label="ट्रिप हटाओ">×</button></div>';
    }).join('');
  }

  function openTripsScreen() {
    renderTrips();
    setView('trips');
  }

  function createTrip() {
    var name = $('tripInput').value.trim();
    if (!name) { alert('ट्रिप का नाम लिखो'); return; }
    var t = makeTrip(name);
    data.trips.push(t);
    data.currentId = t.id;
    $('tripInput').value = '';
    save();
    renderAll();
    setView('trip');
  }

  function openTrip(id) {
    data.currentId = id;
    save();
    renderAll();
    setView('trip');
  }

  function deleteTrip(id) {
    var t = null;
    data.trips.forEach(function (x) { if (x.id === id) t = x; });
    if (!t) return;
    if (!confirm('"' + t.name + '" ट्रिप पूरी मिटा दें? ये वापस नहीं आएगी।')) return;
    data.trips = data.trips.filter(function (x) { return x.id !== id; });
    if (!data.trips.length) data.trips.push(makeTrip('मेरी ट्रिप'));
    if (data.currentId === id) data.currentId = data.trips[0].id;
    save();
    renderAll();
    renderTrips();
  }

  // ---------- सब दिखाओ ----------
  function renderAll() {
    $('tripName').textContent = 'ट्रिप: ' + T().name;
    renderPeople();
    renderSplitChecks();
    resetForm();
    renderExpenses();
  }

  // ---------- शुरू ----------
  document.addEventListener('DOMContentLoaded', function () {
    load();
    renderAll();

    $('addPersonBtn').addEventListener('click', addPerson);
    $('personInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') addPerson(); });
    $('addExpenseBtn').addEventListener('click', saveExpense);
    $('cancelEditBtn').addEventListener('click', function () { resetForm(); renderExpenses(); });
    $('endTripBtn').addEventListener('click', showResult);
    $('backBtn').addEventListener('click', function () { setView('trip'); });
    $('tripsBtn').addEventListener('click', openTripsScreen);
    $('backFromTripsBtn').addEventListener('click', function () { setView('trip'); });
    $('createTripBtn').addEventListener('click', createTrip);
    $('tripInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') createTrip(); });

    $('peopleList').addEventListener('click', function (e) {
      var id = e.target.getAttribute('data-del-person');
      if (id) removePerson(id);
    });
    $('expenseList').addEventListener('click', function (e) {
      var d = e.target.getAttribute('data-del-exp');
      if (d) { removeExpense(d); return; }
      var ed = e.target.getAttribute('data-edit-exp');
      if (ed) startEdit(ed);
    });
    $('resultBody').addEventListener('click', function (e) {
      if (e.target.id === 'shareBtn') { shareResult(); return; }
      var p = e.target.getAttribute('data-pay');
      if (p) { markPaid(p); return; }
      var u = e.target.getAttribute('data-unpay');
      if (u) undoPaid(u);
    });
    $('tripsList').addEventListener('click', function (e) {
      var node = e.target;
      while (node && node !== $('tripsList') && !(node.getAttribute && (node.getAttribute('data-open-trip') || node.getAttribute('data-del-trip')))) {
        node = node.parentNode;
      }
      if (!node || node === $('tripsList')) return;
      var o = node.getAttribute('data-open-trip');
      if (o) { openTrip(o); return; }
      var d = node.getAttribute('data-del-trip');
      if (d) deleteTrip(d);
    });
  });
})();
