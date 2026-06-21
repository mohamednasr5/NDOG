/**
 * NileDogs (NDOG) — Particle Background
 * -----------------------------------------
 * Lightweight canvas-based particle animation.
 * Renders subtle floating dots in NileDogs brand colours (blue & gold).
 *
 * Expects a <canvas id="particles"> element in the HTML.
 * Call `NDOG.Particles.init()` after DOM is ready.
 * Call `NDOG.Particles.destroy()` to stop the loop.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /*  State                                                               */
  /* ------------------------------------------------------------------ */

  var canvas = null;
  var ctx = null;
  var particles = [];
  var animId = null;
  var dpr = 1;

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function createParticle(w, h) {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      // 60 % blue (hue 205), 40 % gold (hue 48)
      hue: Math.random() < 0.6 ? 205 : 48,
      alpha: Math.random() * 0.4 + 0.2,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Module                                                              */
  /* ------------------------------------------------------------------ */

  window.NDOG = window.NDOG || {};
  window.NDOG.Particles = {
    /**
     * Bootstrap: find canvas, size it, spawn particles, start loop.
     */
    init: function () {
      canvas = document.getElementById('particles');
      if (!canvas) return;

      ctx = canvas.getContext('2d');
      dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2×

      this.resize();
      this.animate();

      // Re-create particles on resize
      var self = this;
      var resizeTimer;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          self.resize();
        }, 150);
      });
    },

    /**
     * Resize canvas to fill the viewport (retina-aware).
     */
    resize: function () {
      if (!canvas) return;
      var w = window.innerWidth;
      var h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      if (ctx) ctx.scale(dpr, dpr);
      this.createParticles(w, h);
    },

    /**
     * Populate the particles array based on viewport size.
     * Fewer particles on small screens to save CPU.
     * @param {number} w  – logical (CSS) width
     * @param {number} h  – logical (CSS) height
     */
    createParticles: function (w, h) {
      var area = (w || window.innerWidth) * (h || window.innerHeight);
      var count = Math.min(60, Math.max(15, Math.floor(area / 25000)));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push(createParticle(w || window.innerWidth, h || window.innerHeight));
      }
    },

    /**
     * Main animation loop.
     */
    animate: function () {
      if (!ctx || !canvas) return;

      var w = window.innerWidth;
      var h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Bounce off edges
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        // Clamp position (safety)
        p.x = Math.max(0, Math.min(w, p.x));
        p.y = Math.max(0, Math.min(h, p.y));

        // Draw
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.1, p.r), 0, Math.PI * 2);
        ctx.fillStyle = 'hsla(' + p.hue + ',90%,65%,' + p.alpha + ')';
        ctx.fill();
      }

      // Optional: draw faint connection lines between nearby particles
      this.drawConnections(w, h);

      var self = this;
      animId = requestAnimationFrame(function () {
        self.animate();
      });
    },

    /**
     * Draw faint lines between particles that are within 120 px of
     * each other.  This adds a "network" feel without being heavy.
     * @param {number} w
     * @param {number} h
     */
    drawConnections: function (w, h) {
      var maxDist = 120;
      var maxDistSq = maxDist * maxDist;

      ctx.lineWidth = 0.4;

      for (var i = 0; i < particles.length; i++) {
        for (var j = i + 1; j < particles.length; j++) {
          var dx = particles[i].x - particles[j].x;
          var dy = particles[i].y - particles[j].y;
          var distSq = dx * dx + dy * dy;

          if (distSq < maxDistSq) {
            var dist = Math.sqrt(distSq);
            var opacity = (1 - dist / maxDist) * 0.15;
            ctx.strokeStyle =
              'rgba(160,180,210,' + opacity.toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    },

    /**
     * Stop the animation loop and clear the canvas.
     */
    destroy: function () {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      particles = [];
    },
  };
})();