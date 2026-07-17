import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Eye,
  Brain,
  Zap,
  ShieldCheck,
  RefreshCw,
  Lock,
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface LiveLayerStatus {
  id: string;
  metricLabel: string;
  metricValue: string;
  detail: string;
  status: 'active' | 'idle';
}

const defenseLayers = [
  {
    id: 'perception',
    num: '01',
    name: 'Perception AI',
    color: '#00d4ff',
    colorClass: 'border-alux-cyan/50 hover:border-alux-cyan/50',
    icon: Eye,
    description:
      'Computer vision and NLP systems continuously monitor all data streams, endpoints, and user behaviors. AI reads logs like a human analyst — but 10,000x faster.',
    fallbackLabel: 'Processing',
    fallbackValue: '—',
  },
  {
    id: 'cognition',
    num: '02',
    name: 'Cognition AI',
    color: '#a855f7',
    colorClass: 'border-alux-purple/50 hover:border-alux-purple/50',
    icon: Brain,
    description:
      'Deep reasoning engines analyze threat context, intent, and potential impact. The AI understands "why" an attack is happening, not just "what".',
    fallbackLabel: 'Submissions analyzed',
    fallbackValue: '—',
  },
  {
    id: 'decision',
    num: '03',
    name: 'Decision AI',
    color: '#c9a84c',
    colorClass: 'border-alux-gold/50 hover:border-alux-gold/50',
    icon: Zap,
    description:
      'Reinforcement learning agents make split-second decisions on threat severity and response strategy. No human approval needed for 99.7% of incidents.',
    fallbackLabel: 'Latency',
    fallbackValue: '—',
  },
  {
    id: 'action',
    num: '04',
    name: 'Action AI',
    color: '#00ff88',
    colorClass: 'border-alux-green/50 hover:border-alux-green/50',
    icon: ShieldCheck,
    description:
      'Autonomous response execution — isolating systems, deploying patches, rerouting traffic, and activating countermeasures without human intervention.',
    fallbackLabel: 'Success rate',
    fallbackValue: '—',
  },
  {
    id: 'evolution',
    num: '05',
    name: 'Evolution AI',
    color: '#f97316',
    colorClass: 'border-alux-orange/50 hover:border-alux-orange/50',
    icon: RefreshCw,
    description:
      'Self-modifying defense algorithms that evolve after every encounter. The AI rewrites its own response strategies based on attack outcomes.',
    fallbackLabel: 'Uptime',
    fallbackValue: '—',
  },
  {
    id: 'counter-ai',
    num: '06',
    name: 'Counter-AI',
    color: '#ff3366',
    colorClass: 'border-alux-red/50 hover:border-alux-red/50',
    icon: Lock,
    description:
      'Adversarial AI that predicts attacker next moves and deploys deceptive countermeasures. Honeypots, fake credentials, and disinformation campaigns.',
    fallbackLabel: 'Bots blocked',
    fallbackValue: '—',
  },
];

export default function DefenseMatrix() {
  const sectionRef = useRef<HTMLElement>(null);
  const [liveStatus, setLiveStatus] = useState<Record<string, LiveLayerStatus>>({});
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch(`${API_BASE}/api/status/defense-matrix`);
        if (!res.ok) throw new Error('Status endpoint unavailable');
        const data = await res.json();
        if (cancelled) return;

        const byId: Record<string, LiveLayerStatus> = {};
        for (const layer of data.layers) {
          byId[layer.id] = layer;
        }
        setLiveStatus(byId);
        setIsLive(true);
      } catch {
        if (!cancelled) setIsLive(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!sectionRef.current) return;
    const cards = sectionRef.current.querySelectorAll('.defense-card');
    gsap.fromTo(
      cards,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.1,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 60%',
          once: true,
        },
      }
    );
  }, []);

  return (
    <section
      ref={sectionRef}
      id="ai-defense"
      className="py-24 md:py-32 bg-navy-surface hex-grid relative"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-16 reveal">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-alux-red/10 border border-alux-red/20 text-alux-red text-sm font-medium mb-4">
            <span
              className={`w-2 h-2 rounded-full mr-2 ${isLive ? 'bg-alux-green animate-ping' : 'bg-alux-red animate-ping'}`}
            />
            {isLive ? 'Live — Connected to Backend' : 'Autonomous Defense Protocols'}
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white mb-6">
            AI <span className="gradient-text-cyan">Defense Matrix</span>
          </h2>
          <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
            Six autonomous AI defense layers working in concert. Each layer operates independently
            yet shares intelligence across the neural network for coordinated threat response.
          </p>
        </div>

        {/* Defense Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {defenseLayers.map((layer, i) => (
            <div
              key={i}
              className={`defense-card bg-navy-surface border rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1 ${layer.colorClass}`}
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = `${layer.color}4D`;
                (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${layer.color}26`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center ai-pulse"
                  style={{
                    background: `linear-gradient(135deg, ${layer.color}, ${layer.color}99)`,
                  }}
                >
                  <layer.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-serif font-semibold text-white">
                    {layer.name}
                  </h3>
                  <span
                    className="text-xs font-mono"
                    style={{ color: layer.color }}
                  >
                    LAYER {layer.num}
                  </span>
                </div>
              </div>
              <p className="text-[#94a3b8] text-sm leading-relaxed mb-4">
                {layer.description}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#475569]">
                  {liveStatus[layer.id]?.metricLabel ?? layer.fallbackLabel}:{' '}
                  <span className="font-mono" style={{ color: layer.color }}>
                    {liveStatus[layer.id]?.metricValue ?? layer.fallbackValue}
                  </span>
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] rounded-full font-mono ${
                    liveStatus[layer.id]?.status === 'idle'
                      ? 'bg-[#475569]/10 text-[#94a3b8]'
                      : 'bg-alux-green/10 text-alux-green'
                  }`}
                >
                  {liveStatus[layer.id]?.status === 'idle' ? 'IDLE' : 'ACTIVE'}
                </span>
              </div>
              {liveStatus[layer.id]?.detail && (
                <p className="text-[10px] text-[#475569] mt-2 font-mono">
                  {liveStatus[layer.id].detail}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
