import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { FlaskConical, Brain, BarChart3 } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const researchItems = [
  {
    num: '01',
    color: '#a855f7',
    title: 'Adversarial AI Defense',
    description: 'Training neural networks to resist adversarial attacks on AI systems themselves.',
  },
  {
    num: '02',
    color: '#00d4ff',
    title: 'Quantum Neural Cryptography',
    description: 'Post-quantum encryption schemes powered by neural key generation algorithms.',
  },
  {
    num: '03',
    color: '#00ff88',
    title: 'Federated Threat Intelligence',
    description: 'Privacy-preserving ML across global networks without centralizing sensitive data.',
  },
  {
    num: '04',
    color: '#f97316',
    title: 'Neural Deception Engines',
    description: 'AI-generated honeypots and decoy systems that evolve to match attacker sophistication.',
  },
];

const metrics = [
  { label: 'Threat Detection (Transformer)', value: '99.99%', gradient: 'from-alux-cyan to-alux-green', width: '99.99%' },
  { label: 'False Positive Rate (GNN)', value: '99.9%', gradient: 'from-alux-purple to-alux-cyan', width: '99.9%' },
  { label: 'Response Time (RL Agent)', value: '98%', gradient: 'from-alux-green to-alux-cyan', width: '98%' },
  { label: 'Prediction Accuracy (72h)', value: '94.3%', gradient: 'from-alux-orange to-alux-gold', width: '94.3%' },
  { label: 'Neural Uptime', value: '99.999%', gradient: 'from-alux-gold to-alux-green', width: '99.999%' },
];

export default function NeuralLab() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    const leftCol = sectionRef.current.querySelector('.lab-left');
    const rightCol = sectionRef.current.querySelector('.lab-right');

    if (leftCol) {
      gsap.fromTo(
        leftCol,
        { opacity: 0, x: -40 },
        {
          opacity: 1,
          x: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 60%',
            once: true,
          },
        }
      );
    }

    if (rightCol) {
      gsap.fromTo(
        rightCol,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          delay: 0.2,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 60%',
            once: true,
          },
        }
      );
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      id="ai-lab"
      className="py-24 md:py-32 bg-navy-dark relative overflow-hidden matrix-bg"
    >
      {/* Holographic Scanline Overlay */}
      <div className="scanline-overlay animate-flicker">
        <div className="scanline-crt" />
        <div className="scanline-chromatic-left" />
        <div className="scanline-chromatic-right" />
        <div className="scanline-vignette" />
      </div>

      {/* Neural glow background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 20% 50%, rgba(0,212,255,0.06) 0%, transparent 40%), radial-gradient(circle at 80% 80%, rgba(168,85,247,0.04) 0%, transparent 40%)',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-alux-cyan/10 border border-alux-cyan/20 text-alux-cyan text-sm font-medium mb-4">
            <FlaskConical className="w-4 h-4 mr-2" />
            AI Research Laboratory
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white mb-6">
            Inside the <span className="gradient-text-cyan">Neural Lab</span>
          </h2>
          <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
            Our AI research division pushes the boundaries of autonomous cybersecurity. From
            adversarial machine learning to quantum-resistant neural cryptography.
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Research Initiatives */}
          <div className="lab-left glass-effect-cyan rounded-2xl p-8">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Brain className="w-5 h-5 text-alux-cyan" />
              Research Initiatives
            </h3>
            <div className="space-y-4">
              {researchItems.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-4 p-4 rounded-lg ${
                    i < researchItems.length - 1 ? 'border-b border-white/[0.06]' : ''
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold"
                    style={{ backgroundColor: `${item.color}26`, color: item.color }}
                  >
                    {item.num}
                  </div>
                  <div>
                    <h4 className="text-white text-sm font-semibold">{item.title}</h4>
                    <p className="text-[#475569] text-xs mt-1">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Performance Metrics */}
          <div className="lab-right glass-effect-cyan rounded-2xl p-8">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-alux-green" />
              AI Performance Metrics
            </h3>
            <div className="space-y-6">
              {metrics.map((metric, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-[#94a3b8]">{metric.label}</span>
                    <span className="text-alux-cyan font-mono">{metric.value}</span>
                  </div>
                  <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden relative">
                    <div
                      className={`h-full bg-gradient-to-r ${metric.gradient} rounded-full relative`}
                      style={{ width: metric.width }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
