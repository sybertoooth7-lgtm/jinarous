import { useEffect, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import { Zap, BarChart3, ChevronDown } from 'lucide-react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  hue: number;
}

function useParticleCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let w = window.innerWidth;
    let h = window.innerHeight;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    window.addEventListener('resize', resize);

    // Create particles
    const count = window.innerWidth < 768 ? 400 : 1200;
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.6 + 0.2,
        hue: Math.random() > 0.7 ? 270 : 190, // mostly cyan, some purple
      });
    }

    const animate = () => {
      ctx.fillStyle = 'rgba(5, 10, 18, 0.15)';
      ctx.fillRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        const color = p.hue === 270 ? '168, 85, 247' : '0, 212, 255';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${p.alpha})`;
        ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.08 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef]);
}

function LiveCounter() {
  const [count, setCount] = useState(2847193);

  useEffect(() => {
    const interval = setInterval(() => {
      setCount((prev) => prev + Math.floor(Math.random() * 5) + 1);
    }, 2000 + Math.random() * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="counter-animate">
      {count.toLocaleString()}
    </span>
  );
}

export default function Hero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useParticleCanvas(canvasRef);

  useEffect(() => {
    if (!contentRef.current) return;
    const els = contentRef.current.children;
    gsap.fromTo(
      els,
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.15,
        delay: 0.2,
      }
    );
  }, []);

  const scrollToSection = useCallback((href: string) => {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const stats = [
    { value: <LiveCounter />, label: 'THREATS NEUTRALIZED', indicator: 'LIVE AI COUNTER' },
    { value: '99.99%', label: 'AI ACCURACY RATE', indicator: '+0.02% THIS HOUR' },
    { value: '8ms', label: 'AI RESPONSE TIME', indicator: 'AUTONOMOUS MODE' },
    { value: '50B+', label: 'NEURAL PARAMETERS', indicator: 'DEEP LEARNING ACTIVE' },
  ];

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center hero-gradient grid-pattern-cyan overflow-hidden"
    >
      {/* Particle Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      />

      {/* Radial overlay for text readability */}
      <div
        className="absolute inset-0 z-[2]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(5,10,18,0.7) 0%, transparent 70%)',
        }}
      />

      {/* Content */}
      <div ref={contentRef} className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-24 pb-16">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-alux-cyan/10 border border-alux-cyan/30 text-alux-cyan text-sm font-medium mb-8">
          <span className="w-2 h-2 bg-alux-cyan rounded-full mr-2 animate-pulse"></span>
          <span className="font-mono text-xs tracking-wider uppercase typing-cursor">
            NEURAL SECURITY v5.0 ACTIVE
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif font-bold text-white mb-6 leading-tight">
          Autonomous
          <br />
          <span className="gradient-text-cyan">AI Defense</span>
          <br />
          <span className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-[#94a3b8]">
            Command Center
          </span>
        </h1>

        {/* Description */}
        <p className="text-lg md:text-xl text-[#94a3b8] max-w-2xl mx-auto mb-10 leading-relaxed">
          Alux Plaza operates the world&apos;s largest neural security network. Our{' '}
          <span className="text-alux-cyan font-semibold">50-billion parameter AI</span>{' '}
          processes{' '}
          <span className="text-alux-purple font-semibold">2.4 million threats per second</span>,
          autonomously neutralizing attacks before they reach your perimeter.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <button
            onClick={() => scrollToSection('#contact')}
            className="px-8 py-4 btn-gradient text-white font-bold rounded-full hover:shadow-xl hover:shadow-alux-cyan/30 transition-all hover:scale-105 text-lg flex items-center gap-2"
          >
            <Zap className="w-5 h-5" />
            Deploy Neural Shield
          </button>
          <button
            onClick={() => scrollToSection('#ai-core')}
            className="px-8 py-4 border border-alux-cyan/50 text-alux-cyan font-semibold rounded-full hover:bg-alux-cyan/10 transition-all text-lg flex items-center gap-2"
          >
            <BarChart3 className="w-5 h-5" />
            View AI Core Metrics
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="glass-effect-cyan rounded-2xl p-5 md:p-6 text-center relative overflow-hidden group data-stream"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-alux-cyan/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-alux-cyan mb-1 font-mono counter-animate">
                  {stat.value}
                </div>
                <div className="text-[10px] md:text-xs text-[#94a3b8] uppercase tracking-wider">
                  {stat.label}
                </div>
                <div className="mt-2 flex items-center justify-center text-alux-green text-[10px] font-mono">
                  <span className="w-1.5 h-1.5 bg-alux-green rounded-full mr-1 animate-pulse" />
                  {stat.indicator}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
        <ChevronDown className="w-6 h-6 text-alux-cyan/30" />
      </div>
    </section>
  );
}
