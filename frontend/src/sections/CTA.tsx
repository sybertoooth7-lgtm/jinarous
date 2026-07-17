import { useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Zap, Phone } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export default function CTA() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const els = sectionRef.current.querySelectorAll('.cta-animate');
    gsap.fromTo(
      els,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.15,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 70%',
          once: true,
        },
      }
    );
  }, []);

  const scrollToContact = useCallback(() => {
    const el = document.querySelector('#contact');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <section
      ref={sectionRef}
      className="py-24 md:py-32 relative overflow-hidden"
    >
      {/* Background gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(0,212,255,0.08) 0%, rgba(10,22,40,1) 50%, rgba(168,85,247,0.08) 100%)',
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,212,255,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <div className="cta-animate inline-flex items-center px-4 py-2 rounded-full bg-alux-cyan/10 border border-alux-cyan/20 text-alux-cyan text-sm font-medium mb-6">
          <span className="w-2 h-2 bg-alux-cyan rounded-full mr-2 animate-pulse" />
          NEURAL DEPLOYMENT READY
        </div>

        <h2 className="cta-animate text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white mb-6">
          Activate Your <span className="gradient-text-cyan">AI Defense</span>
        </h2>

        <p className="cta-animate text-lg md:text-xl text-[#94a3b8] mb-10 max-w-2xl mx-auto">
          Join enterprises protected by autonomous neural defense. Our AI begins learning your
          environment within seconds of deployment.
        </p>

        <div className="cta-animate flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={scrollToContact}
            className="px-8 py-4 btn-gradient text-white font-bold rounded-full hover:shadow-xl hover:shadow-alux-cyan/30 transition-all hover:scale-105 text-lg flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5" />
            Initialize Neural Shield
          </button>
          <a
            href="tel:+18002589241"
            className="px-8 py-4 border border-alux-cyan/50 text-alux-cyan font-semibold rounded-full hover:bg-alux-cyan/10 transition-all text-lg flex items-center justify-center gap-2"
          >
            <Phone className="w-5 h-5" />
            1-800-ALUX-AI
          </a>
        </div>
      </div>
    </section>
  );
}
