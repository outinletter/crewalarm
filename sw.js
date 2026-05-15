/* ═══════════════════════════════════════
   CREW CLOCK — Service Worker v2
   Place this file as sw.js in the SAME
   folder as index.html on your server.
═══════════════════════════════════════ */
var SW_VERSION = '2.0.0';

self.addEventListener('install', function(e){
  self.skipWaiting();
});
self.addEventListener('activate', function(e){
  e.waitUntil(clients.claim());
});
self.addEventListener('message', function(e){
  if(!e.data) return;
  if(e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if(e.data.type === 'SCHEDULE_ALARMS') scheduleAlarms(e.data.alarms);
  if(e.data.type === 'CANCEL_ALL') { pendingAlarms=[]; stopCheck(); }
});

var pendingAlarms = [];
var checkTimer = null;

function scheduleAlarms(list){
  list.forEach(function(a){
    if(!pendingAlarms.find(function(p){ return p.id===a.id; }))
      pendingAlarms.push(a);
  });
  startCheck();
}

function startCheck(){
  if(checkTimer) return;
  checkTimer = setInterval(fireReady, 15000);
  fireReady();
}
function stopCheck(){
  if(checkTimer){ clearInterval(checkTimer); checkTimer=null; }
}

function fmtTime(d){
  d = new Date(d);
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

function fireReady(){
  var now = Date.now();
  var fired = [];

  pendingAlarms = pendingAlarms.filter(function(a){
    var t = new Date(a.time).getTime();
    var diff = now - t;
    if(diff >= 0 && diff < 180000){
      var body = fmtTime(a.time) + (a.dep ? ' · DEP '+fmtTime(a.dep) : '');
      self.registration.showNotification('✈ ' + a.lbl, {
        body: body,
        requireInteraction: true,
        vibrate: [500, 200, 500, 200, 500, 200, 500],
        tag: 'crewclock-' + a.id,
        renotify: true,
        actions: [
          { action: 'dismiss', title: 'Dismiss' },
          { action: 'snooze', title: '+5 min' }
        ],
        data: { id: a.id, time: a.time, dep: a.dep, lbl: a.lbl }
      }).catch(function(err){ console.warn('[SW notify]', err); });
      fired.push(a.id);
      return false; // remove from queue
    }
    return diff < 180000; // keep if not yet expired
  });

  if(fired.length){
    self.clients.matchAll({ type:'window' }).then(function(cls){
      cls.forEach(function(c){
        c.postMessage({ type:'ALARM_FIRED', ids:fired });
      });
    });
  }
  if(!pendingAlarms.length) stopCheck();
}

self.addEventListener('notificationclick', function(e){
  var action = e.action;
  var data = e.notification.data || {};
  e.notification.close();

  if(action === 'snooze'){
    var snoozeTime = new Date(Date.now() + 5*60*1000);
    pendingAlarms.push({
      id: data.id + '_snz_' + Date.now(),
      time: snoozeTime.toISOString(),
      lbl: '(+5m) ' + (data.lbl||'Alarm'),
      dep: data.dep || null
    });
    startCheck();
    return;
  }

  // Tap on notification → open/focus app
  e.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true })
      .then(function(cls){
        for(var i=0; i<cls.length; i++){
          if(cls[i].url && cls[i].focus) return cls[i].focus();
        }
        if(self.clients.openWindow) return self.clients.openWindow('./');
      })
  );
});
