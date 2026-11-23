(() => {
  "use strict";

  const videoRoot = "assets/videos/";
  const videoElements = [...document.querySelectorAll("video[data-video]")];
  const motionButton = document.querySelector(".motion-toggle");
  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let paused = reduceMotion;

  // Reveal content as it enters the viewport.
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(el => revealObserver.observe(el));
  } else {
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("visible"));
  }

  // Assign video URLs only when needed; keep off-screen videos paused.
  const loadVideo = video => {
    if (video.dataset.loaded === "true") return;
    const name = video.dataset.video;
    if (!name) return;
    video.src = videoRoot + name;
    video.dataset.loaded = "true";
    video.load();
  };

  const playIfAllowed = video => {
    if (paused || reduceMotion || document.hidden) return;
    loadVideo(video);
    const promise = video.play();
    if (promise && typeof promise.catch === "function") promise.catch(() => {});
  };

  if ("IntersectionObserver" in window) {
    const videoObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;
        if (entry.isIntersecting) {
          loadVideo(video);
          if (video.classList.contains("hero-video") || entry.intersectionRatio >= 0.18) playIfAllowed(video);
        } else {
          video.pause();
        }
      });
    }, { threshold: [0, 0.18, 0.5] });
    videoElements.forEach(video => videoObserver.observe(video));
  } else {
    videoElements.forEach(loadVideo);
  }

  videoElements.forEach(video => {
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.addEventListener("error", () => {
      video.classList.add("video-failed");
      const parent = video.parentElement;
      if (parent) parent.classList.add("video-fallback");
    });
  });

  if (motionButton) {
    const updateMotionButton = () => {
      motionButton.setAttribute("aria-pressed", String(paused));
      motionButton.innerHTML = paused ? "<span>▶</span> PLAY MOTION" : "<span>Ⅱ</span> PAUSE MOTION";
    };
    updateMotionButton();
    if (reduceMotion) motionButton.title = "Motion is disabled by your reduced-motion preference";
    motionButton.addEventListener("click", () => {
      paused = !paused;
      videoElements.forEach(video => {
        if (paused) video.pause();
        else if (video.getBoundingClientRect().width && video.getBoundingClientRect().height) playIfAllowed(video);
      });
      updateMotionButton();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) videoElements.forEach(video => video.pause());
    else if (!paused && !reduceMotion) {
      videoElements.forEach(video => {
        const rect = video.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) playIfAllowed(video);
      });
    }
  });

  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    }));
  }
})();