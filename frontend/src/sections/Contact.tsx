import { useState, useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { API_BASE } from '../lib/api';

gsap.registerPlugin(ScrollTrigger);

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  message: string;
  website: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  message?: string;
  submit?: string;
}

const contactItems = [
  { label: 'Email', value: 'neural@aluxplaza.com' },
  { label: 'Response Time', value: '< 60 seconds' },
  { label: 'Availability', value: '24/7 Neural Uptime' },
];

export default function Contact() {
  const sectionRef = useRef<HTMLElement>(null);
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    message: '',
    website: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!sectionRef.current) return;
    const leftCol = sectionRef.current.querySelector('.contact-left');
    const rightCol = sectionRef.current.querySelector('.contact-right');

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

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.message.trim()) newErrors.message = 'Message is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      setIsSubmitting(true);
      setErrors((prev) => ({ ...prev, submit: undefined }));

      try {
        const payload = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          company: formData.company,
          email: formData.email,
          message: formData.message,
          honeypot: formData.website,
        };

        const res = await fetch(`${API_BASE}/api/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          type ValidationDetail = { path?: string; msg?: string };
          const details: ValidationDetail[] = Array.isArray(data.details) ? data.details : [];
          const realFieldErrors = details.filter((d) => d.path && d.path !== 'honeypot');

          if (realFieldErrors.length > 0) {
            throw new Error(realFieldErrors[0].msg || data.error || 'Please check the form and try again.');
          }
          if (details.some((d) => d.path === 'honeypot')) {
            throw new Error(
              "We couldn't submit this automatically. Please email us directly at neural@aluxplaza.com and we'll follow up right away."
            );
          }
          throw new Error(data.error || 'Something went wrong. Please try again.');
        }

        setSubmitted(true);
      } catch (err) {
        setErrors((prev) => ({
          ...prev,
          submit: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        }));
      } finally {
        setIsSubmitting(false);
      }
    },
    [validate, formData]
  );

  const handleChange = useCallback(
    (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field as keyof FormErrors]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  const inputClass =
    'w-full px-4 py-3.5 bg-navy-base/50 border border-white/[0.1] rounded-xl text-white placeholder-[#475569] focus:border-alux-cyan focus:ring-1 focus:ring-alux-cyan outline-none transition-all text-sm';

  const inputErrorClass =
    'w-full px-4 py-3.5 bg-navy-base/50 border border-alux-red rounded-xl text-white placeholder-[#475569] focus:border-alux-red focus:ring-1 focus:ring-alux-red outline-none transition-all text-sm';

  return (
    <section ref={sectionRef} id="contact" className="py-24 px-6 relative overflow-hidden">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-start">
        <div className="contact-left space-y-8">
          <div>
            <p className="text-alux-cyan text-sm font-medium tracking-wider uppercase mb-3">
              Neural Support Center
            </p>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Initialize Contact</h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              Our AI concierge analyzes your requirements and connects you with the optimal neural
              security architect within 60 seconds.
            </p>
          </div>

          <div className="space-y-6">
            {contactItems.map((item, i) => (
              <div key={item.label} className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-alux-cyan/10 flex items-center justify-center text-alux-cyan text-sm font-bold">
                  {i + 1}
                </div>
                <div>
                  <p className="text-slate-500 text-sm">{item.label}</p>
                  <p className="text-white font-medium">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="contact-right">
          {submitted ? (
            <div className="bg-navy-base/50 border border-white/[0.1] rounded-2xl p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-alux-cyan/10 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-alux-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Request Transmitted</h3>
              <p className="text-slate-400">
                Your AI assessment request has been transmitted. Our neural concierge will
                contact you within 60 seconds.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-navy-base/50 border border-white/[0.1] rounded-2xl p-8 space-y-6">
              {errors.submit && (
                <div className="bg-alux-red/10 border border-alux-red/30 rounded-xl p-4 text-alux-red text-sm">
                  {errors.submit}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-slate-400 text-sm mb-2">First Name</label>
                  <input
                    autoComplete="given-name"
                    type="text"
                    value={formData.firstName}
                    onChange={handleChange('firstName')}
                    className={errors.firstName ? inputErrorClass : inputClass}
                    placeholder="John"
                  />
                  {errors.firstName && (
                    <p className="text-alux-red text-xs mt-1">{errors.firstName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-slate-400 text-sm mb-2">Last Name</label>
                  <input
                    autoComplete="family-name"
                    type="text"
                    value={formData.lastName}
                    onChange={handleChange('lastName')}
                    className={errors.lastName ? inputErrorClass : inputClass}
                    placeholder="Doe"
                  />
                  {errors.lastName && (
                    <p className="text-alux-red text-xs mt-1">{errors.lastName}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">Email</label>
                <input
                  autoComplete="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange('email')}
                  className={errors.email ? inputErrorClass : inputClass}
                  placeholder="john@company.com"
                />
                {errors.email && (
                  <p className="text-alux-red text-xs mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">Company</label>
                <input
                  autoComplete="organization"
                  type="text"
                  value={formData.company}
                  onChange={handleChange('company')}
                  className={inputClass}
                  placeholder="Acme Inc."
                />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">Message</label>
                <textarea
                  autoComplete="off"
                  value={formData.message}
                  onChange={handleChange('message')}
                  rows={4}
                  className={errors.message ? inputErrorClass : inputClass}
                  placeholder="Describe your security requirements..."
                />
                {errors.message && (
                  <p className="text-alux-red text-xs mt-1">{errors.message}</p>
                )}
              </div>

              {/* Honeypot field — hidden from users, visible to bots */}
              <div className="hidden" aria-hidden="true">
                <input
                  type="text"
                  value={formData.website}
                  onChange={handleChange('website')}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-alux-cyan hover:bg-alux-cyan/90 text-navy-base font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Transmitting...' : 'Initialize Contact'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
