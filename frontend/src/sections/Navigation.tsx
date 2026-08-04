import { useState, useEffect, useCallback } from 'react';
import { Menu, X, Shield } from 'lucide-react';

const navLinks = [
  { href: '#ai-core', label: 'Approach' },
  { href: '#ai-defense', label: 'Live Status' },
  { href: '#services', label: 'Services' },
  { href: '#ai-lab', label: 'Research' },
];

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = useCallback((href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <nav
      className={`fixed w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[rgba(5,10,18,0.85)] backdrop-blur-[16px] border-b border-white/[0.06]'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-[72px]">
          {/* Logo */}
          <button
            onClick={scrollToTop}
            className="flex items-center space-x-3 cursor-pointer group"
            aria-label="Scroll to top"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-alux-cyan via-alux-purple to-alux-gold rounded-lg flex items-center justify-center shadow-lg shadow-alux-cyan/20 neural-glow">
              <Shield className="w-6 h-6 text-navy-base" strokeWidth={2.5} />
            </div>
            <span className="text-2xl font-serif font-bold tracking-wide">
              <span className="text-white">ALUX</span>{' '}
              <span className="gradient-text-cyan">PLAZA</span>
            </span>
          </button>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollToSection(link.href)}
                className="nav-link text-sm font-medium text-[#94a3b8] hover:text-white transition-colors"
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={() => scrollToSection('#contact')}
              className="px-6 py-2.5 btn-gradient text-white font-semibold rounded-full hover:shadow-lg hover:shadow-alux-cyan/25 transition-all hover:scale-105 text-sm"
            >
              Book a Consultation
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-[#94a3b8] hover:text-white transition-colors p-2"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="glass-effect border-t border-white/[0.06] px-4 py-4 space-y-1">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => scrollToSection(link.href)}
              className="block w-full text-left px-4 py-3 text-[#94a3b8] hover:text-alux-gold hover:bg-white/5 rounded-lg transition-colors text-sm font-medium"
            >
              {link.label}
            </button>
          ))}
          <button
            onClick={() => scrollToSection('#contact')}
            className="block w-full text-left px-4 py-3 text-alux-cyan font-semibold"
          >
            Book a Consultation
          </button>
        </div>
      </div>
    </nav>
  );
}
