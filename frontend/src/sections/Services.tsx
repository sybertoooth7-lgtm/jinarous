import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Shield,
  BarChart3,
  Database,
  Zap,
  Fingerprint,
  FileCheck,
  Bug,
  Globe,
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const services = [
  {
    title: 'Neural Perimeter Defense',
    description:
      'Transformer networks analyze every packet in real-time. Zero-day exploits detected via semantic understanding of attack patterns.',
    icon: Shield,
    accent: '#00d4ff',
    tags: ['8ms response', '99.99% accuracy'],
    wide: true,
  },
  {
    title: 'Predictive Risk Engine',
    description:
      'Graph neural networks map your attack surface and predict vulnerability exploitation paths 72 hours in advance.',
    icon: BarChart3,
    accent: '#a855f7',
    tags: ['72h prediction', '94% precision'],
    wide: false,
  },
  {
    title: 'Neural Data Vault',
    description:
      'AI-powered data classification using natural language understanding. Neural encryption keys adapt dynamically.',
    icon: Database,
    accent: '#00ff88',
    tags: ['Quantum-safe', 'Zero leaks'],
    wide: false,
  },
  {
    title: 'Autonomous Incident Response',
    description:
      'When breaches occur, our AI orchestrates the entire response — containment, forensics, recovery, and reporting — without waiting for human approval.',
    icon: Zap,
    accent: '#c9a84c',
    tags: ['12ms response', 'Full automation'],
    wide: true,
  },
  {
    title: 'Behavioral Biometric AI',
    description:
      'Neural networks build behavioral fingerprints for every user and device. Anomalies trigger instant AI verification protocols.',
    icon: Fingerprint,
    accent: '#ff3366',
    tags: ['2.4M profiles', 'Real-time'],
    wide: false,
  },
  {
    title: 'AI Compliance Engine',
    description:
      'Our AI continuously monitors your infrastructure against GDPR, HIPAA, SOC 2, and ISO 27001 requirements.',
    icon: FileCheck,
    accent: '#00d4ff',
    tags: ['Auto-reports', '100% compliant'],
    wide: false,
  },
  {
    title: 'Neural Deception',
    description:
      'AI-generated honeypots and decoy systems that evolve to match attacker sophistication. Waste attacker time on fake targets.',
    icon: Bug,
    accent: '#a855f7',
    tags: ['Active decoys', 'Adaptive'],
    wide: false,
  },
  {
    title: 'Federated Intelligence',
    description:
      'Privacy-preserving ML across global networks. Threat insights shared across all client networks anonymously.',
    icon: Globe,
    accent: '#00ff88',
    tags: ['Global mesh', 'Zero-trust'],
    wide: false,
  },
];

export default function Services() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gridRef.current) return;
    const tiles = gridRef.current.querySelectorAll('.bento-tile');

    gsap.fromTo(
      tiles,
      { opacity: 0, y: 60, rotateX: 15 },
      {
        opacity: 1,
        y: 0,
        rotateX: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: {
          trigger: gridRef.current,
          start: 'top 75%',
          once: true,
        },
      }
    );

    // Parallax depth on scroll
    const rows = Array.from(tiles);
    rows.forEach((tile, i) => {
      gsap.to(tile, {
        z: 30 + (i % 3) * 15,
        scrollTrigger: {
          trigger: gridRef.current,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1,
        },
      });
    });
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    grid.style.transform = `rotateY(${x * 3}deg) rotateX(${-y * 3}deg)`;
  };

  const handleMouseLeave = () => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.style.transform = 'rotateY(0deg) rotateX(0deg)';
  };

  return (
    <section
      id="services"
      className="py-24 md:py-32 bg-navy-base relative overflow-hidden"
    >
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(0,212,255,0.04) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-16 reveal">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-alux-cyan/10 border border-alux-cyan/20 text-alux-cyan text-sm font-medium mb-4">
            AI-Native Services
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white mb-6">
            <span className="gradient-text-cyan">Intelligent</span>{' '}
            <span className="gradient-text-purple">Security Services</span>
          </h2>
          <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
            Every service runs on dedicated neural sub-networks fine-tuned for specific security
            domains.
          </p>
        </div>

        {/* Bento Grid */}
        <div
          ref={gridRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          style={{
            perspective: '1000px',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.3s ease-out',
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {services.map((service, i) => (
            <div
              key={i}
              className={`bento-tile bg-navy-surface border border-white/[0.06] rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] ${
                service.wide ? 'md:col-span-2' : ''
              }`}
              style={{ transformStyle: 'preserve-3d' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = `${service.accent}4D`;
                (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${service.accent}26`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-4"
                style={{
                  background: `linear-gradient(135deg, ${service.accent}, ${service.accent}99)`,
                }}
              >
                <service.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-serif font-semibold text-white mb-2">
                {service.title}
              </h3>
              <p className="text-[#94a3b8] text-sm leading-relaxed mb-4">
                {service.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {service.tags.map((tag, ti) => (
                  <span
                    key={ti}
                    className="px-2 py-0.5 rounded-full text-[11px] font-mono"
                    style={{
                      backgroundColor: `${service.accent}26`,
                      color: service.accent,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
