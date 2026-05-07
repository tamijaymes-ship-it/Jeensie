// ======================== AUDIO FEEDBACK (soft beep) ========================
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}
function playBeep() {
  if (!audioCtx) initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      beepNow();
    }).catch(()=>{});
  } else {
    beepNow();
  }
}
function beepNow() {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.12);
    osc.stop(audioCtx.currentTime + 0.12);
  } catch(e) {}
}

function attachSoundToButtons() {
  const elements = document.querySelectorAll('button, select, input');
  elements.forEach(el => {
    el.addEventListener('click', (e) => {
      if (el.id !== 'predictBtn') playBeep();
    });
  });
  const predictBtn = document.getElementById('predictBtn');
  if (predictBtn) {
    predictBtn.addEventListener('click', () => { playBeep(); });
  }
}

// ======================== PREDICTION ENGINE ========================
const baseCurve = [
  { p: 99.99, f: 1.45 }, { p: 99.9,  f: 1.33 }, { p: 99.8,  f: 1.25 }, { p: 99.7,  f: 1.20 },
  { p: 99.6,  f: 1.15 }, { p: 99.5,  f: 1.12 }, { p: 99.4,  f: 1.09 }, { p: 99.3,  f: 1.06 },
  { p: 99.2,  f: 1.04 }, { p: 99.1,  f: 1.02 }, { p: 99.0,  f: 1.00 }, { p: 98.5, f: 0.927 },
  { p: 98.0, f: 0.876 }, { p: 97.5, f: 0.824 }, { p: 97.0, f: 0.788 }, { p: 96.5, f: 0.756 },
  { p: 96.0, f: 0.725 }, { p: 95.5, f: 0.699 }, { p: 95.0, f: 0.674 }, { p: 94.0, f: 0.637 },
  { p: 93.0, f: 0.596 }, { p: 92.0, f: 0.560 }, { p: 91.0, f: 0.534 }, { p: 90.0, f: 0.508 },
  { p: 80.0, f: 0.400 }, { p: 70.0, f: 0.320 }, { p: 60.0, f: 0.260 }, { p: 50.0, f: 0.210 },
  { p: 40.0, f: 0.170 }, { p: 30.0, f: 0.140 }, { p: 20.0, f: 0.110 }, { p: 10.0, f: 0.080 },
  { p: 0.0,  f: 0.040 }
];

const shiftM99 = {
  "21S1": 170, "21S2": 179, "22S1": 184, "22S2": 150,
  "23S1": 172, "23S2": 152, "24S1": 174, "24S2": 158,
  "28S1": 170, "28S2": 185
};

const BLACKLIST = [289, 293, 294, 297, 298, 299];

function difficultyFactor(M99) { 
  return Math.min(Math.max((M99 - 151) / (236 - 151), 0), 1); 
}

function adjustedF(pt, M99) {
  const t = difficultyFactor(M99);
  if (pt.p === 99.0) return 1.0;
  if (pt.p > 99.0) return pt.f * (1.08 - 0.20 * t);
  return pt.f * (0.96 + 0.04 * t);
}

function generateCurve(M99) { 
  return baseCurve.map(pt => ({ p: pt.p, m: adjustedF(pt, M99) * M99 })); 
}

function getPercentile(curve, marks) {
  if (marks >= curve[0].m) return curve[0].p;
  if (marks <= curve[curve.length-1].m) return curve[curve.length-1].p;
  for (let i=0; i<curve.length-1; i++) {
    if (marks <= curve[i].m && marks >= curve[i+1].m)
      return curve[i].p + (marks - curve[i].m) * (curve[i+1].p - curve[i].p) / (curve[i+1].m - curve[i].m);
  }
  return 0;
}

function getRankRange(p) {
  let lower = Math.floor((100 - p) * 1500000 / 100);
  let upper = Math.floor((100 - p) * 1600000 / 100);
  return { lower: Math.max(1, lower), upper: Math.max(1, upper) };
}

// DOM elements
const shiftSelect = document.getElementById('shiftSelect');
const marksInput = document.getElementById('marksInput');
const predictBtn = document.getElementById('predictBtn');
const resultArea = document.getElementById('resultArea');
const percentileSpan = document.getElementById('percentileVal');
const rankSpan = document.getElementById('rankVal');

predictBtn.addEventListener('click', () => {
  const shift = shiftSelect.value;
  let marks = parseInt(marksInput.value, 10);
  if (!shift) { alert("🐱 Please select a shift first."); return; }
  if (isNaN(marks) || marks < 0 || marks > 300) { alert("🐱 Enter marks between 0-300."); return; }
  if (BLACKLIST.includes(marks)) { alert("🐱 Blacklisted marks (289,293,294,297,298,299). Choose different value."); return; }
  const M99 = shiftM99[shift];
  if (!M99) { alert("🐱 Shift data error."); return; }
  const curve = generateCurve(M99);
  let percentile = getPercentile(curve, marks);
  percentile = Math.min(99.99, Math.max(0, percentile));
  const { lower, upper } = getRankRange(percentile);
  percentileSpan.innerText = percentile.toFixed(2) + "%";
  rankSpan.innerText = `# ${lower.toLocaleString()} – ${upper.toLocaleString()}`;
  resultArea.style.display = "flex";
});

// ======================== PINK PARTICLE BACKGROUND ========================
const canvas = document.getElementById('bgCanvas');
let ctx = canvas.getContext('2d');
let particles = [];
let mouseX = 0, mouseY = 0;

function resizeCanvas() { 
  canvas.width = window.innerWidth; 
  canvas.height = window.innerHeight; 
}

class Particle {
  constructor() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.vx = (Math.random() - 0.5) * 0.35;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.size = Math.random() * 2 + 0.8;
    this.alpha = Math.random() * 0.5 + 0.2;
  }
  update() {
    this.x += this.vx; 
    this.y += this.vy;
    if (this.x < 0) this.x = canvas.width;
    if (this.x > canvas.width) this.x = 0;
    if (this.y < 0) this.y = canvas.height;
    if (this.y > canvas.height) this.y = 0;
    const dx = mouseX - this.x, dy = mouseY - this.y, dist = Math.hypot(dx, dy);
    if (dist < 130) {
      const angle = Math.atan2(dy, dx), force = (130 - dist) / 1400;
      this.vx -= Math.cos(angle) * force;
      this.vy -= Math.sin(angle) * force;
      let spd = Math.hypot(this.vx, this.vy);
      if (spd > 0.9) { this.vx *= 0.98; this.vy *= 0.98; }
    }
  }
  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 160, 200, ${this.alpha * 0.7})`;
    ctx.fill();
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ff99bb';
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function initParticles(n=150) { 
  particles = Array.from({length:n}, () => new Particle()); 
}

function drawLines() {
  for (let i=0; i<particles.length; i++)
    for (let j=i+1; j<particles.length; j++) {
      const d = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
      if (d < 110) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(255, 140, 180, ${0.08 * (1 - d/110)})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff5f8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => { p.update(); p.draw(); });
  drawLines();
  requestAnimationFrame(animate);
}

window.addEventListener('resize', () => { resizeCanvas(); initParticles(150); });
window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
resizeCanvas();
initParticles(150);
animate();

// attach audio to all interactive elements
attachSoundToButtons();