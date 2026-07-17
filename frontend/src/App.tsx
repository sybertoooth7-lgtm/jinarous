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
    // Global scroll-triggered reveals
    const revealElements = document.querySelectorAll('.reveal');
    revealElements.forEach((el) => {
      gsap.fromTo(
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
    });

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <div className="min-h-screen bg-navy-base text-white overflow-x-hidden">
      <Navigation />
      <main>
        <Hero />
        <AICore />
        <DefenseMatrix />
        <Services />
        <NeuralLab />
        <CTA />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}

export default App;
