import { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Mail, Phone, MapPin, Zap, CheckCircle } from 'lucide-react';
import { API_BASE } from '@/lib/api';

gsap.registerPlugin(ScrollTrigger);

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  message: string;
  website: string; // honeypot field, kept empty by real users, hidden via CSS
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  submit?: string;
}

const contactItems = [
  {
    icon: Mail,
    iconBg: 'bg-alux-cyan/10',
    iconColor: 'text-alux-cyan',
    label: 'AI Concierge',
    value: 'neural@aluxplaza.com',
  },
  {
    icon: Phone,
    iconBg: 'bg-alux-purple/10',
    iconColor: 'text-alux-purple',
    label: 'Neural Hotline',
    value: '+1 (800) 258-9241',
  },
  {
    icon: MapPin,
    iconBg: 'bg-alux-green/10',
    iconColor: 'text-alux-green',
    label: 'AI Research Center',
    value: 'One Neural Plaza, New York, NY 10004',
  },
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
        const res = await fetch(`${API_BASE}/api/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          // The backend returns a generic "Validation failed." for every
          // 400, with per-field messages in `details`. Show the SPECIFIC
          // real-field message when there is one (e.g. "A valid email is
          // required.") rather than the unhelpful generic string.
          //
          // Special case: if the ONLY problem is the hidden honeypot field
          // (`website`) - which can happen to a genuine human if a browser
          // extension or password manager auto-fills every input on the
          // page, not just a bot - don't show the raw "Spam detected."
          // message, which would be confusing since the user can't see
          // that field at all. Give them a real way to still reach us
          // instead of a dead end.
          type ValidationDetail = { path?: string; msg?: string };
          const details: ValidationDetail[] = Array.isArray(data.details) ? data.details : [];
          const realFieldErrors = details.filter((d) => d.path && d.path !== 'website');

          if (realFieldErrors.length > 0) {
            throw new Error(realFieldErrors[0].msg || data.error || 'Please check the form and try again.');
          }
          if (details.some((d) => d.path === 'website')) {
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
    <section
      ref={sectionRef}
      id="contact"
      className="py-24 md:py-32 bg-navy-surface"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
          {/* Left: Contact Info */}
          <div className="contact-left">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-alux-cyan/10 border border-alux-cyan/20 text-alux-cyan text-sm font-medium mb-4">
              <Mail className="w-4 h-4 mr-2" />
              Neural Support Center
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white mb-6">
              Initialize <span className="gradient-text-cyan">Contact</span>
            </h2>
            <p className="text-[#94a3b8] text-lg mb-8 max-w-md">
              Our AI concierge analyzes your requirements and connects you with the optimal neural
              security architect within 60 seconds.
            </p>

            <div className="space-y-6">
              {contactItems.map((item, i) => (
                <div key={i} className="flex items-center">
                  <div
                    className={`w-12 h-12 ${item.iconBg} rounded-xl flex items-center justify-center mr-4`}
                  >
                    <item.icon className={`w-6 h-6 ${item.iconColor}`} />
                  </div>
                  <div>
                    <div className="text-white font-semibold text-sm">{item.label}</div>
                    <div className="text-[#94a3b8] text-sm">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Form */}
          <div className="contact-right">
            <div className="glass-effect-cyan rounded-2xl p-6 md:p-8">
              {submitted ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-alux-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-alux-green" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Request Transmitted</h3>
                  <p className="text-[#94a3b8] text-sm max-w-xs mx-auto">
                    Your AI assessment request has been transmitted. Our neural concierge will
                    contact you within 60 seconds.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-[#94a3b8] mb-2">
                        First Name
                      </label>
                      <input
                        type="text"
                        value={formData.firstName}
                        onChange={handleChange('firstName')}
                        placeholder="John"
                        className={errors.firstName ? inputErrorClass : inputClass}
                      />
                      {errors.firstName && (
                        <p className="text-alux-red text-xs mt-1">{errors.firstName}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#94a3b8] mb-2">
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={formData.lastName}
                        onChange={handleChange('lastName')}
                        placeholder="Doe"
                        className={errors.lastName ? inputErrorClass : inputClass}
                      />
                      {errors.lastName && (
                        <p className="text-alux-red text-xs mt-1">{errors.lastName}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#94a3b8] mb-2">
                      Work Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={handleChange('email')}
                      placeholder="john@company.com"
                      className={errors.email ? inputErrorClass : inputClass}
                    />
                    {errors.email && (
                      <p className="text-alux-red text-xs mt-1">{errors.email}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#94a3b8] mb-2">
                      Company
                    </label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={handleChange('company')}
                      placeholder="Acme Corp"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#94a3b8] mb-2">
                      AI Security Requirements
                    </label>
                    <textarea
                      rows={4}
                      value={formData.message}
                      onChange={handleChange('message')}
                      placeholder="Describe your infrastructure and AI security needs..."
                      className={`${inputClass} resize-none`}
                    />
                  </div>
                  {/* Honeypot field - real users never fill this in; bots often do.
                      Wrapped in display:none (not just off-screen positioning), since
                      that's the technique browsers, screen readers, AND password
                      managers/autofill all reliably skip - off-screen-only hiding can
                      still get swept up by "fill all fields" autofill behavior in some
                      browsers/extensions, which would silently reject a real user. */}
                  <div style={{ display: 'none' }} aria-hidden="true">
                    <input
                      type="text"
                      name="website"
                      autoComplete="off"
                      value={formData.website}
                      onChange={handleChange('website')}
                    />
                  </div>
                  {errors.submit && (
                    <p className="text-alux-red text-sm text-center">{errors.submit}</p>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 btn-gradient text-white font-bold rounded-xl hover:shadow-lg hover:shadow-alux-cyan/25 transition-all hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    <Zap className="w-5 h-5" />
                    {isSubmitting ? 'Transmitting...' : 'Initialize AI Assessment'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
