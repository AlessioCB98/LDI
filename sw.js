'use strict';

const cacheName = 'ldi-shell-v1';
const files = ['./index.html', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const scope = self.registration.scope;
const shell = new URL('./index.html', scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files)));
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  const url = new URL(request.url);
  if (request.mode === 'navigate' && [scope, shell].includes(url.origin + url.pathname)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(shell))
      .then(response => response || fetch(request)));
    return;
  }
  if (files.some(file => new URL(file, scope).href === request.url)) {
    event.respondWith(caches.open(cacheName).then(cache => cache.match(request))
      .then(response => response || fetch(request)));
  }
});
