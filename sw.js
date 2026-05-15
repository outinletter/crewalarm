/* ═══════════════════════════════════════════
   CREW CLOCK — Service Worker
   Handles background alarm notifications
═══════════════════════════════════════════ */
var CACHE_NAME = 'crewclock-v1';
var SW_VERSION = '1.0.0';

/* ── Install ── */
self.addEventListener('install', function(e){
  self.skipWaiting();
});

/* ── Activate ── */
self.addEventListener('activate', function(e){
  e.waitUntil(clients.claim());
});

/* ── Message from main app: schedule alarm ── */
self.addEventListener('message', function(e){
  var data = e.data;
  if(!data) return;

  if(data.type === 'SCHEDULE_ALARMS'){
    scheduleAlarms(data.alarms);
  }
  if(data.type === 'CANCEL_ALL'){
    cancelAllAlarms();
  }
  if(data.type === 'PING'){
    e.ports[0].postMessage({type:'PONG', version:SW_VERSION});
  }
});

/* ── Alarm storage ── */
var pendingAlarms = [];  // [{id, time, lbl, dep}]
var checkInterval = null;

function scheduleAlarms(alarms){
  // Merge with existing, deduplicate by id
  alarms.forEach(function(a){
    var exists = pendingAlarms.find(function(p){return p.id===a.id;});
    if(!exists) pendingAlarms.push(a);
  });
  startChecking();
}

function cancelAllAlarms(){
  pendingAlarms = [];
}

function startChecking(){
  if(checkInterval) return; // already running
  checkInterval = setInterval(function(){
    fireReadyAlarms();
  }, 15000); // check every 15s
  fireReadyAlarms(); // immediate first check
}

function fireReadyAlarms(){
  var now = Date.now();
  var fired = [];

  pendingAlarms = pendingAlarms.filter(function(a){
    var t = new Date(a.time).getTime();
    var diff = now - t;
    if(diff >= 0 && diff < 180000){ // within 3 min window
      showAlarmNotification(a);
      fired.push(a.id);
      return false; // remove from queue
    }
    if(diff >= 180000){ // expired
      return false;
    }
    return true; // keep
  });

  // Notify main app if it's open
  if(fired.length > 0){
    self.clients.matchAll({type:'window'}).then(function(clients){
      clients.forEach(function(c){
        c.postMessage({type:'ALARM_FIRED', ids:fired});
      });
    });
  }

  // Stop interval if no more alarms
  if(pendingAlarms.length === 0 && checkInterval){
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

function showAlarmNotification(alarm){
  var title = '✈ ' + alarm.lbl;
  var depStr = alarm.dep ? ' · DEP ' + formatTime(new Date(alarm.dep)) : '';
  var body = formatTime(new Date(alarm.time)) + depStr;

  self.registration.showNotification(title, {
    body: body,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="%233b82c4"/><text y="44" x="32" text-anchor="middle" font-size="36" font-family="Arial">✈</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="%233b82c4"/></svg>',
    tag: 'crewclock-alarm-' + alarm.id,
    renotify: true,
    requireInteraction: true,
    vibrate: [400, 150, 400, 150, 400, 150, 400],
    actions: [
      {action: 'dismiss', title: 'Dismiss'},
      {action: 'snooze', title: 'Snooze 5m'}
    ],
    data: { alarmId: alarm.id, alarmTime: alarm.time }
  });
}

function formatTime(d){
  if(!(d instanceof Date) || isNaN(d)) return '--:--';
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

/* ── Notification click ── */
self.addEventListener('notificationclick', function(e){
  var action = e.action;
  var alarm = e.notification.data;
  e.notification.close();

  if(action === 'snooze' && alarm){
    // Snooze 5 minutes
    var snoozeTime = new Date(Date.now() + 5*60*1000);
    pendingAlarms.push({
      id: alarm.alarmId + '_snooze',
      time: snoozeTime.toISOString(),
      lbl: '(Snooze) ' + e.notification.title.replace('✈ ',''),
      dep: alarm.dep
    });
    startChecking();
    return;
  }

  // Open / focus app on notification tap
  e.waitUntil(
    self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(clients){
      for(var i=0;i<clients.length;i++){
        if(clients[i].url && clients[i].focus){
          clients[i].focus();
          return;
        }
      }
      if(self.clients.openWindow){
        return self.clients.openWindow('./');
      }
    })
  );
});
