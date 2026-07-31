import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Navigation from './sections/Navigation';
import Hero from './sections/Hero';
import AICore from './sections/AICore';
import DefenseMatrix from './sections/DefenseMatrix';
import Services from './sections/Services';
import NeuralLab from './sections/NeuralLab';
import CTA from './sections/CTA';
import Contact from './sections/Contact';
import Footer from './sections/Footer';

gsap.registerPlugin(ScrollTrigger);

function App() {
  useEffect(() => {
    const triggers: ScrollTrigger[] = [];
    const revealElements = document.querySelectorAll('.reveal');
    revealElements.forEach((el) => {
      const tween = gsap.fromTo(
        el,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            once: true,
          },
        }
      );
      if (tween.scrollTrigger) {
        triggers.push(tween.scrollTrigger);
      }
    });

    return () => {
      triggers.forEach((t) => t.kill());
    };
  }, []);

  return (
    <div className="min-h-screen bg-navy-base text-white overflow-x-hidden">
      <Navigation />
      <Hero />
      <AICore />
      <DefenseMatrix />
      <Services />
      <NeuralLab />
      <CTA />
      <Contact />
      <Footer />
    </div>
  );
}

export default App;
