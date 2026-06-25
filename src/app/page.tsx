'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  ConciergeBell,
  Home,
  Hotel,
  Map,
  Menu,
  MessageCircle,
  Phone,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Utensils,
  Waves,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';

const ease = [0.16, 1, 0.3, 1] as const;

const images = {
  hero: '/cloudview/1st.png',
  craftsmanship: '/cloudview/2nd.png',
  engineering: '/cloudview/3rd.png',
  access: '/cloudview/4th.png',
  flow: '/cloudview/5.png',
  gallery: '/cloudview/All.png',
};

const navItems = [
  { label: 'Experience', href: '#experience' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Guest Portal', href: '#guest-portal' },
  { label: 'Design', href: '#design' },
];
const experienceCards = [
  {
    icon: <BookOpen className="size-5" />,
    title: 'Hotel Guide',
    text: 'Info, instantly.',
  },
  {
    icon: <Utensils className="size-5" />,
    title: 'Order Food',
    text: 'Dining in-room.',
  },
  {
    icon: <Waves className="size-5" />,
    title: 'Pool Info',
    text: 'Hours and rules.',
  },
  {
    icon: <ConciergeBell className="size-5" />,
    title: 'Request Service',
    text: 'Amenities fast.',
  },
  {
    icon: <Map className="size-5" />,
    title: 'Local Guide',
    text: 'Explore nearby.',
  },
  {
    icon: <Home className="size-5" />,
    title: 'Room Instructions',
    text: 'Clear and simple.',
  },
];

const luxuryDetails = ['Crystal edges', 'Floating mounts', 'Soft-lit finish'];

const benefits = [
  'Update room info anytime',
  'Reduce repetitive questions',
  'Guide guests instantly',
  'Route service requests faster',
  'Elevate every room touchpoint',
];

const galleryLabels = [
  'Room-ready',
  'Premium finish',
  'Always accessible',
  'No app required',
];

const faqs = [
  {
    question: 'Do guests need an app?',
    answer: 'No. CloudView opens instantly in the browser after one NFC tap.',
  },
  {
    question: 'Can the portal match our brand?',
    answer: 'Yes. Logo, colors, room content, services, and guest flows can be customized.',
  },
  {
    question: 'What can guests access?',
    answer: 'Hotel guide, dining, pool info, service requests, instructions, and staff contact.',
  },
  {
    question: 'Is it made for resorts and villas?',
    answer: 'Yes. It works for hotels, resorts, villas, Airbnb stays, and serviced apartments.',
  },
];

const adminScreens = [
  {
    label: 'Command Center',
    title: 'Daily operations pulse.',
    text: 'Live kitchen, services, inventory, and front desk flow.',
    src: '/cloudview/overview.png',
  },
  {
    label: 'Analytics',
    title: 'Business clarity.',
    text: 'Revenue, orders, requests, and operational movement.',
    src: '/cloudview/analytics.png',
  },
  {
    label: 'Guest Stays',
    title: 'Front desk control.',
    text: 'Guest stays, passcodes, devices, orders, and requests.',
    src: '/cloudview/guest-stays.png',
  },
  {
    label: 'Kitchen Display',
    title: 'Kitchen flow.',
    text: 'Pending, preparing, ready, scheduled, and rush orders.',
    src: '/cloudview/kitchen-display.png',
  },
  {
    label: 'NFC Tags',
    title: 'Access management.',
    text: 'Room tags, public tags, secure links, and scan tracking.',
    src: '/cloudview/nfc-tags.png',
  },
  {
    label: 'Reports',
    title: 'Operational records.',
    text: 'Sales, service, inventory, audit, and export center.',
    src: '/cloudview/reports.png',
  },
];

const guestScreens = [
  {
    label: 'Guest Home',
    title: 'Personalized stay.',
    text: 'Guests see room info, Wi-Fi, shortcuts, and services instantly.',
    src: '/cloudview/guest-portal.png',
  },
  {
    label: 'Order Food',
    title: 'Dining made simple.',
    text: 'Browse menus, view rewards, add items, and order in seconds.',
    src: '/cloudview/guest-order.png',
  },
  {
    label: 'Request Service',
    title: 'Amenities on demand.',
    text: 'Extra towels, cleaning, laundry, maintenance, and concierge requests.',
    src: '/cloudview/guest-request.png',
  },
  {
    label: 'Hotel Guide',
    title: 'Everything in one place.',
    text: 'Guide guests through essentials, shortcuts, and property information.',
    src: '/cloudview/hotel-guide.png',
  },
];

const heroSequence = [
  {
    step: '01',
    label: 'Hero',
    eyebrow: 'NFC-powered guest portal',
    title: 'Hospitality.',
    goldTitle: 'One tap away.',
    text: 'CloudView turns every room into a seamless digital guest experience.',
    src: images.hero,
    alt: 'CloudView luxury NFC signage',
  },
  {
    step: '02',
    label: 'Crafted',
    eyebrow: 'Crystal precision',
    title: 'Crafted with',
    goldTitle: 'crystal-clear precision.',
    text: 'Polished glass edges and premium mounting bring modern hospitality to life.',
    src: images.craftsmanship,
    alt: 'CloudView crystal glass precision close-up',
  },
  {
    step: '03',
    label: 'Engineered',
    eyebrow: 'Floating luxury',
    title: 'Engineered to float',
    goldTitle: 'with quiet luxury.',
    text: 'Precision standoffs create a clean, elevated presence in every room.',
    src: images.engineering,
    alt: 'CloudView floating standoff detail',
  },
  {
    step: '04',
    label: 'Instant Access',
    eyebrow: 'Tap your phone',
    title: 'One tap.',
    goldTitle: 'Everything, instantly.',
    text: 'Hotel info, services, dining, pool details, and guidance at your fingertips.',
    src: images.access,
    alt: 'CloudView tap your phone instant access signage',
  },
  {
    step: '05',
    label: 'How it works',
    eyebrow: 'NFC built in',
    title: 'NFC, built in.',
    goldTitle: 'Tap. Connect. Done.',
    text: 'Secure instant access to hotel info, services, and guidance.',
    src: images.flow,
    alt: 'CloudView NFC built-in diagram',
  },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}


function IPhoneFrame({
  screen,
  index,
  active = false,
}: {
  screen: (typeof guestScreens)[number];
  index: number;
  active?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-0.5, 0.5], [7, -7]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-8, 8]);

  function handleMove(event: MouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;

    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{
        rotateX: reduceMotion ? 0 : rotateX,
        rotateY: reduceMotion ? 0 : rotateY,
        transformStyle: 'preserve-3d',
      }}
      initial={{ opacity: 0, y: 70, scale: 0.9, filter: 'blur(18px)' }}
      whileInView={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-120px' }}
      transition={{
        duration: 0.95,
        delay: index * 0.12,
        ease,
      }}
      className={cn(
        'relative mx-auto w-[230px] md:w-[255px]',
        active && 'md:w-[285px]'
      )}
    >
      <div
        className={cn(
          'absolute -inset-8 rounded-full blur-[80px]',
          active ? 'bg-[#C9A45C]/28' : 'bg-[#C9A45C]/12'
        )}
      />

      <motion.div
        animate={
          reduceMotion
            ? undefined
            : {
                y: [0, index % 2 === 0 ? -14 : 14, 0],
              }
        }
        transition={{
          duration: 7 + index,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="relative rounded-[2.8rem] border border-[#E7C878]/28 bg-[linear-gradient(135deg,#0b0b0a,#030303)] p-2.5 shadow-[0_42px_130px_rgba(0,0,0,.62)]"
      >
        <div className="absolute left-1/2 top-2.5 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />

        <div className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-black">
          <Image
            src={screen.src}
            alt={screen.title}
            width={430}
            height={930}
            className="h-[505px] w-full object-cover object-top md:h-[560px]"
            sizes="(max-width: 768px) 80vw, 300px"
          />

          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,.18),transparent_22%,transparent_72%,rgba(231,200,120,.14))]" />

          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent,rgba(231,200,120,.16),transparent)] transition duration-1000 group-hover:translate-x-full" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.75, delay: 0.25 + index * 0.1, ease }}
        className="relative mx-auto mt-5 w-fit rounded-full border border-[#E7C878]/25 bg-[#C9A45C]/10 px-4 py-2 text-center backdrop-blur-xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E7C878]">
          {screen.label}
        </p>
      </motion.div>
    </motion.div>
  );
}

function GuestPortalShowcaseSection() {
  return (
    <section
      id="guest-portal"
      className="relative overflow-hidden bg-[#030303] px-6 py-28 text-[#F6F1E8] sm:px-8"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(201,164,92,.2),transparent_34%),linear-gradient(#030303,#0B0B0A)]" />

      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,.28)_1px,transparent_0)] [background-size:34px_34px]" />

      <div className="pointer-events-none absolute left-0 top-20 h-px w-full bg-gradient-to-r from-transparent via-[#E7C878]/45 to-transparent" />

      <motion.div
        aria-hidden="true"
        animate={{
          opacity: [0.24, 0.6, 0.24],
          scale: [1, 1.12, 1],
        }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute right-[-15rem] top-28 size-[520px] rounded-full bg-[#C9A45C]/18 blur-[130px]"
      />

      <div className="relative mx-auto w-full max-w-[1760px]">
        <Reveal className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C878]">
              Guest Portal
            </p>

            <h2 className="mt-4 text-[clamp(3.4rem,7vw,7rem)] font-light leading-[0.92] tracking-[-0.07em]">
              Everything your guests need.
              <span className="block text-[#E7C878]">One tap away.</span>
            </h2>
          </div>

          <p className="max-w-xl text-lg font-light leading-8 text-white/48 lg:ml-auto">
            Dining, service requests, hotel guide, and stay essentials in one
            premium mobile experience.
          </p>
        </Reveal>

        <div className="relative mt-20">
          <div className="absolute left-1/2 top-1/2 hidden size-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#E7C878]/10 md:block" />
          <div className="absolute left-1/2 top-1/2 hidden size-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#E7C878]/15 md:block" />

          <div className="grid items-end gap-10 md:grid-cols-2 xl:grid-cols-4">
            {guestScreens.map((screen, index) => (
              <IPhoneFrame
                key={screen.label}
                screen={screen}
                index={index}
                active={index === 1}
              />
            ))}
          </div>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-4">
          {[
            {
              icon: <RadioTower className="size-5" />,
              title: 'One tap access',
              text: 'No app required.',
            },
            {
              icon: <Utensils className="size-5" />,
              title: 'Dining flow',
              text: 'Menu to kitchen.',
            },
            {
              icon: <Bell className="size-5" />,
              title: 'Live requests',
              text: 'Staff sees it fast.',
            },
            {
              icon: <ShieldCheck className="size-5" />,
              title: 'Private session',
              text: 'Room-aware access.',
            },
          ].map((item, index) => (
            <Reveal key={item.title} delay={index * 0.06}>
              <motion.div
                whileHover={{ y: -8 }}
                className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(201,164,92,.12),transparent_45%)] opacity-0 transition duration-500 hover:opacity-100" />

                <div className="relative grid size-11 place-items-center rounded-2xl bg-[#C9A45C]/12 text-[#E7C878]">
                  {item.icon}
                </div>

                <p className="relative mt-5 text-lg font-light text-[#F6F1E8]">
                  {item.title}
                </p>

                <p className="relative mt-2 text-sm font-light text-white/42">
                  {item.text}
                </p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36, filter: 'blur(12px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.9, delay, ease }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function MagneticButton({
  href,
  children,
  variant = 'gold',
}: {
  href: string;
  children: ReactNode;
  variant?: 'gold' | 'glass';
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springX = useSpring(x, { stiffness: 170, damping: 18 });
  const springY = useSpring(y, { stiffness: 170, damping: 18 });

  function handleMove(event: MouseEvent<HTMLAnchorElement>) {
    if (reduceMotion) return;

    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left - rect.width / 2) * 0.18);
    y.set((event.clientY - rect.top - rect.height / 2) * 0.18);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div style={{ x: springX, y: springY }} className="inline-flex">
      <Link
        href={href}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className={cn(
          'group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-full px-6 text-sm font-semibold tracking-tight transition duration-300 focus:outline-none focus:ring-2 focus:ring-[#E7C878]/50',
          variant === 'gold'
            ? 'bg-[#C9A45C] text-black shadow-[0_22px_70px_rgba(201,164,92,0.35)] hover:bg-[#E7C878]'
            : 'border border-white/15 bg-white/[0.06] text-[#F6F1E8] backdrop-blur-2xl hover:bg-white/[0.1]'
        )}
      >
        {variant === 'gold' ? (
          <span className="absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent,rgba(255,255,255,.45),transparent)] transition duration-1000 group-hover:translate-x-full" />
        ) : null}

        <span className="relative z-10">{children}</span>
        <ArrowRight className="relative z-10 size-4 transition duration-300 group-hover:translate-x-1" />
      </Link>
    </motion.div>
  );
}

function BrandMark() {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.035] py-1.5 pl-1.5 pr-5 backdrop-blur-2xl transition duration-500 hover:border-[#E7C878]/35 hover:bg-white/[0.07]"
      aria-label="CloudView Smart Guest Portal"
    >
      <div className="relative grid size-12 place-items-center overflow-hidden rounded-[1.15rem] border border-[#E7C878]/25 bg-[#C9A45C] shadow-[0_18px_55px_rgba(201,164,92,0.32)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,rgba(255,255,255,.65),transparent_34%)]" />

        <Image
          src="/cloudview/cloudview-icon.png"
          alt=""
          width={42}
          height={42}
          className="relative z-10 h-9 w-9 object-contain mix-blend-multiply"
          priority
        />
      </div>

      <div className="leading-none">
        <p className="text-[13px] font-semibold uppercase tracking-[0.26em] text-[#F6F1E8]">
          CloudView
        </p>
        <p className="mt-1 text-[11px] font-medium tracking-wide text-white/42">
          Smart Guest Portal
        </p>
      </div>
    </Link>
  );
}

function FloatingNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 18);
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-50 px-4 py-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease }}
          className={cn(
            'mx-auto flex w-full max-w-[1760px] items-center justify-between rounded-full border px-4 py-3 backdrop-blur-2xl transition duration-500',
            scrolled
              ? 'border-white/12 bg-[#030303]/72 shadow-[0_18px_60px_rgba(0,0,0,0.28)]'
              : 'border-white/8 bg-white/[0.035]'
          )}
        >
          <BrandMark />

          <nav className="hidden items-center gap-8 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-white/48 transition hover:text-[#F6F1E8]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/dashboard/login"
              className="rounded-full px-4 py-2 text-sm font-semibold text-white/55 transition hover:text-white"
            >
              Login
            </Link>

            <Link
              href="#demo"
              className="rounded-full bg-[#C9A45C] px-5 py-2.5 text-sm font-semibold text-black shadow-[0_16px_40px_rgba(201,164,92,0.26)] transition hover:bg-[#E7C878]"
            >
              Request Demo
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white md:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
        </motion.div>
      </header>

      {menuOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[80] bg-black/80 p-4 backdrop-blur-2xl md:hidden"
        >
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
            <div className="flex items-center justify-between">
              <BrandMark />

              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="grid size-10 place-items-center rounded-full bg-white/10 text-white"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-8 grid gap-3">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 text-sm font-semibold text-white"
                >
                  {item.label}
                </Link>
              ))}

              <Link
                href="#demo"
                onClick={() => setMenuOpen(false)}
                className="rounded-2xl bg-[#C9A45C] px-4 py-4 text-center text-sm font-semibold text-black"
              >
                Request Demo
              </Link>
            </div>
          </div>
        </motion.div>
      ) : null}
    </>
  );
}

function SpotlightBackground() {
  const x = useMotionValue(50);
  const y = useMotionValue(25);
  const smoothX = useSpring(x, { stiffness: 80, damping: 24 });
  const smoothY = useSpring(y, { stiffness: 80, damping: 24 });
  const background = useMotionTemplate`
    radial-gradient(circle at ${smoothX}% ${smoothY}%, rgba(201,164,92,.28), transparent 28%),
    radial-gradient(circle at 80% 10%, rgba(255,255,255,.12), transparent 24%),
    linear-gradient(135deg, #030303, #0B0B0A 46%, #030303)
  `;

  useEffect(() => {
    function handleMove(event: globalThis.MouseEvent) {
      x.set((event.clientX / window.innerWidth) * 100);
      y.set((event.clientY / window.innerHeight) * 100);
    }

    window.addEventListener('mousemove', handleMove, { passive: true });

    return () => window.removeEventListener('mousemove', handleMove);
  }, [x, y]);

  return (
    <motion.div
      style={{ background }}
      className="absolute inset-0"
      aria-hidden="true"
    />
  );
}

function GoldLine() {
  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration: 1.25, delay: 0.85, ease }}
      className="mt-7 h-px w-full max-w-xl origin-left bg-gradient-to-r from-transparent via-[#E7C878] to-transparent"
    />
  );
}

function HeroImage() {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const smoothX = useSpring(x, { stiffness: 90, damping: 20 });
  const smoothY = useSpring(y, { stiffness: 90, damping: 20 });
  const rotateY = useTransform(smoothX, [-0.5, 0.5], [-8, 8]);
  const rotateX = useTransform(smoothY, [-0.5, 0.5], [7, -7]);

  function handleMove(event: MouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;

    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function resetMove() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      onMouseMove={handleMove}
      onMouseLeave={resetMove}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
      }}
      className="relative mx-auto w-full max-w-[760px] perspective-[1200px]"
    >
      <div className="absolute -inset-10 rounded-full bg-[#C9A45C]/20 blur-[110px]" />

      <motion.div
        initial={{ opacity: 0, y: 70, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.2, delay: 0.25, ease }}
        className="group relative overflow-hidden rounded-[2.25rem] border border-white/12 bg-white/[0.045] shadow-[0_60px_180px_rgba(0,0,0,.6)] backdrop-blur-2xl"
      >
        <motion.div
          animate={
            reduceMotion
              ? undefined
              : {
                  scale: [1, 1.035, 1],
                  y: [0, -8, 0],
                }
          }
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Image
            src={images.hero}
            alt="CloudView luxury NFC signage"
            width={1700}
            height={1000}
            priority
            className="h-[500px] w-full object-cover md:h-[620px]"
          />
        </motion.div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(231,200,120,.18),transparent_32%)]" />

        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent,rgba(255,255,255,.16),transparent)] transition duration-1000 group-hover:translate-x-full" />

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1, ease }}
          className="absolute bottom-5 left-5 right-5 rounded-[1.5rem] border border-white/12 bg-black/42 p-4 backdrop-blur-2xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#E7C878]">
                Room Portal
              </p>
              <p className="mt-1 text-xl font-semibold text-[#F6F1E8]">
                Tap. Open. Serve.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="relative grid size-11 place-items-center rounded-2xl bg-[#C9A45C] text-black">
                <span className="absolute inset-0 rounded-2xl bg-[#C9A45C] opacity-45 blur-md" />
                <Wifi className="relative size-5 animate-pulse" />
              </span>

              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/12 px-3 py-1 text-xs font-semibold text-emerald-100">
                Live
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-[#030303] text-[#F6F1E8]">
      <SpotlightBackground />

      <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,.34)_1px,transparent_0)] [background-size:34px_34px]" />

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:88px_88px]" />

      <FloatingNavbar />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1760px] items-center gap-14 px-6 pb-20 pt-36 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:pb-24">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
            className="inline-flex rounded-full border border-[#C9A45C]/24 bg-[#C9A45C]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#E7C878]"
          >
            NFC-powered guest portal
          </motion.p>

          <motion.h1
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: {
                transition: {
                  staggerChildren: 0.12,
                },
              },
            }}
            className="mt-8 text-[clamp(4.4rem,9vw,9rem)] font-light leading-[0.88] tracking-[-0.075em]"
          >
            {['Hospitality.', 'One tap away.'].map((line, index) => (
              <motion.span
                key={line}
                variants={{
                  hidden: { opacity: 0, y: 84, filter: 'blur(18px)' },
                  show: { opacity: 1, y: 0, filter: 'blur(0px)' },
                }}
                transition={{ duration: 1, ease }}
                className={cn(
                  'block overflow-hidden',
                  index === 1 && 'text-[#E7C878]'
                )}
              >
                {line}
              </motion.span>
            ))}
          </motion.h1>

          <GoldLine />

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 0.95, ease }}
            className="mt-7 max-w-xl text-lg font-light leading-8 text-white/58"
          >
            CloudView turns every room into a seamless digital guest experience.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, delay: 1.12, ease }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <MagneticButton href="#demo">Request Demo</MagneticButton>

            <MagneticButton href="#experience" variant="glass">
              See Experience
            </MagneticButton>
          </motion.div>
        </div>

        <HeroImage />
      </div>
    </section>
  );
}

function ScrollStory() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 24,
    mass: 0.35,
  });

  const tapOpacity = useTransform(
    smoothProgress,
    [0, 0.14, 0.32, 0.46],
    [1, 1, 0.34, 0.12]
  );
  const connectOpacity = useTransform(
    smoothProgress,
    [0.18, 0.36, 0.56, 0.72],
    [0.14, 1, 1, 0.16]
  );
  const doneOpacity = useTransform(
    smoothProgress,
    [0.58, 0.78, 1],
    [0.16, 1, 1]
  );

  const tapY = useTransform(smoothProgress, [0, 0.46], [0, -44]);
  const connectY = useTransform(
    smoothProgress,
    [0.18, 0.46, 0.72],
    [44, 0, -34]
  );
  const doneY = useTransform(smoothProgress, [0.58, 0.82], [42, 0]);

  const tapScale = useTransform(smoothProgress, [0, 0.46], [1, 0.9]);
  const connectScale = useTransform(
    smoothProgress,
    [0.18, 0.46, 0.72],
    [0.9, 1, 0.92]
  );
  const doneScale = useTransform(smoothProgress, [0.58, 0.82], [0.92, 1]);

  const imageScale = useTransform(
    smoothProgress,
    [0, 0.35, 0.72, 1],
    [0.96, 1.02, 1.04, 1]
  );
  const imageY = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    reduceMotion ? [0, 0, 0] : [18, -10, 8]
  );
  const imageRotate = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    reduceMotion ? [0, 0, 0] : [-1.2, 0, 1.2]
  );

  const imageGlowOpacity = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    [0.22, 0.62, 0.34]
  );

  const ringScaleA = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    [0.86, 1.16, 0.96]
  );
  const ringScaleB = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    [0.98, 1.42, 1.06]
  );
  const ringScaleC = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    [1.1, 1.68, 1.16]
  );

 const ringOpacityA = useTransform(
  smoothProgress,
  [0, 0.5, 1],
  [0.16, 0.65, 0.2]
);

const ringOpacityB = useTransform(
  smoothProgress,
  [0, 0.5, 1],
  [0.08, 0.42, 0.12]
);

const ringOpacityC = useTransform(
  smoothProgress,
  [0, 0.5, 1],
  [0.04, 0.26, 0.08]
);

  const scanX = useTransform(
    smoothProgress,
    [0, 0.5, 1],
    ['-130%', '10%', '135%']
  );
  const scanOpacity = useTransform(
    smoothProgress,
    [0, 0.18, 0.8, 1],
    [0, 0.75, 0.75, 0]
  );

  const progressScaleX = useTransform(smoothProgress, [0, 1], [0, 1]);

  const cardOneOpacity = useTransform(
    smoothProgress,
    [0, 0.2, 0.42],
    [1, 1, 0.3]
  );
  const cardTwoOpacity = useTransform(
    smoothProgress,
    [0.22, 0.44, 0.68],
    [0.3, 1, 0.3]
  );
  const cardThreeOpacity = useTransform(
    smoothProgress,
    [0.56, 0.76, 1],
    [0.3, 1, 1]
  );

  const cardOneY = useTransform(smoothProgress, [0, 0.42], [0, -8]);
  const cardTwoY = useTransform(smoothProgress, [0.22, 0.44, 0.68], [12, 0, -8]);
  const cardThreeY = useTransform(smoothProgress, [0.56, 0.76, 1], [12, 0, 0]);

  const stepCards = [
    {
      step: '01',
      title: 'Tap your phone',
      text: 'One simple NFC tap.',
      opacity: cardOneOpacity,
      y: cardOneY,
    },
    {
      step: '02',
      title: 'Secure connection',
      text: 'Portal opens instantly.',
      opacity: cardTwoOpacity,
      y: cardTwoY,
    },
    {
      step: '03',
      title: 'Instant action',
      text: 'Requests flow to staff.',
      opacity: cardThreeOpacity,
      y: cardThreeY,
    },
  ];

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative min-h-[105vh] bg-[#030303] text-[#F6F1E8]"
    >
      <div className="sticky top-0 flex min-h-screen items-center overflow-hidden px-6 py-24 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            style={{ opacity: imageGlowOpacity }}
            className="absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C9A45C]/20 blur-[150px]"
          />

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_36%,rgba(201,164,92,.14),transparent_26%),linear-gradient(to_bottom,rgba(255,255,255,.025),transparent_22%,transparent_78%,rgba(255,255,255,.025))]" />

          <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,.48)_1px,transparent_0)] [background-size:30px_30px]" />

          <motion.div
            style={{ scaleX: progressScaleX }}
            className="absolute left-0 top-0 h-px w-full origin-left bg-gradient-to-r from-transparent via-[#E7C878] to-transparent"
          />
        </div>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-12rem)] w-full w-full max-w-[1760px] gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div className="flex h-full flex-col justify-center">
            <div className="mb-8 max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C878]">
                How it works
              </p>

              <h2 className="mt-4 text-[clamp(2.8rem,6vw,5.4rem)] font-light leading-[0.92] tracking-[-0.06em] text-[#F6F1E8]">
                Tap once.
                <span className="block text-[#E7C878]">Everything moves.</span>
              </h2>
            </div>

            <div className="relative grid gap-6 sm:gap-7">
              <motion.div
                style={{
                  opacity: tapOpacity,
                  y: tapY,
                  scale: tapScale,
                }}
                className="origin-left"
              >
                <p className="text-[clamp(3.25rem,8vw,6.4rem)] font-light leading-none tracking-[-0.08em] text-[#F6F1E8]">
                  Tap.
                </p>
                <p className="mt-2 text-base font-light text-white/46 sm:text-lg">
                  Guests tap their phone.
                </p>
              </motion.div>

              <motion.div
                style={{
                  opacity: connectOpacity,
                  y: connectY,
                  scale: connectScale,
                }}
                className="origin-left"
              >
                <p className="text-[clamp(3.25rem,8vw,6.4rem)] font-light leading-none tracking-[-0.08em] text-[#F6F1E8]">
                  Connect.
                </p>
                <p className="mt-2 text-base font-light text-white/46 sm:text-lg">
                  CloudView opens instantly.
                </p>
              </motion.div>

              <motion.div
                style={{
                  opacity: doneOpacity,
                  y: doneY,
                  scale: doneScale,
                }}
                className="origin-left"
              >
                <p className="text-[clamp(3.25rem,8vw,6.4rem)] font-light leading-none tracking-[-0.08em] text-[#F6F1E8]">
                  Done.
                </p>
                <p className="mt-2 text-base font-light text-white/46 sm:text-lg">
                  Requests flow to your team.
                </p>
              </motion.div>
            </div>
          </div>

          <div className="relative flex h-full items-center">
            <motion.div
              style={
                reduceMotion
                  ? undefined
                  : {
                      scale: imageScale,
                      y: imageY,
                      rotate: imageRotate,
                    }
              }
              className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.015))] p-4 shadow-[0_30px_120px_rgba(0,0,0,.55)] backdrop-blur-xl sm:p-5 lg:p-6"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_38%,rgba(231,200,120,.2),transparent_23%),radial-gradient(circle_at_28%_72%,rgba(201,164,92,.08),transparent_24%)]" />

              <motion.div
                style={{ scale: ringScaleA, opacity: ringOpacityA }}
                className="pointer-events-none absolute right-[16%] top-[15%] h-36 w-36 rounded-full border border-[#E7C878]/45 sm:h-44 sm:w-44"
              />

              <motion.div
                style={{ scale: ringScaleB, opacity: ringOpacityB }}
                className="pointer-events-none absolute right-[12%] top-[12%] h-52 w-52 rounded-full border border-[#E7C878]/20 sm:h-64 sm:w-64"
              />

              <motion.div
                style={{ scale: ringScaleC, opacity: ringOpacityC }}
                className="pointer-events-none absolute right-[8%] top-[8%] h-72 w-72 rounded-full border border-[#E7C878]/10 sm:h-80 sm:w-80"
              />

              <motion.div
                style={{ x: scanX, opacity: scanOpacity }}
                className="pointer-events-none absolute inset-y-0 left-0 z-20 w-28 rotate-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent)] blur-lg"
              />

              <div className="relative overflow-hidden rounded-[1.6rem] border border-white/6 bg-black/45">
                <Image
                  src="/cloudview/5.png"
                  alt="CloudView NFC workflow"
                  width={1400}
                  height={900}
                  className="h-auto max-h-[500px] w-full object-contain object-center p-2 sm:p-4"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {stepCards.map((item) => (
                  <motion.div
                    key={item.step}
                    style={{
                      opacity: item.opacity,
                      y: item.y,
                    }}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E7C878]">
                      {item.step}
                    </p>

                    <p className="mt-2 text-sm font-medium text-[#F6F1E8]">
                      {item.title}
                    </p>

                    <p className="mt-1 text-sm font-light leading-6 text-white/42">
                      {item.text}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TiltCard({
  icon,
  title,
  text,
  delay,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  delay: number;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-0.5, 0.5], [8, -8]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-8, 8]);

  function handleMove(event: MouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;

    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <Reveal delay={delay}>
      <motion.div
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{
          rotateX: reduceMotion ? 0 : rotateX,
          rotateY: reduceMotion ? 0 : rotateY,
          transformStyle: 'preserve-3d',
        }}
        whileHover={{ y: -8 }}
        className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-[0_22px_80px_rgba(0,0,0,.24)] backdrop-blur-2xl"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(201,164,92,.18),transparent_42%)] opacity-0 transition duration-500 group-hover:opacity-100" />

        <div className="relative grid size-12 place-items-center rounded-2xl bg-[#C9A45C]/12 text-[#E7C878]">
          {icon}
        </div>

        <h3 className="relative mt-6 text-2xl font-light text-[#F6F1E8]">
          {title}
        </h3>

        <p className="relative mt-2 text-sm font-light leading-6 text-white/45">
          {text}
        </p>

        <div className="relative mt-6 h-px overflow-hidden bg-white/10">
          <div className="h-full w-1/3 bg-[#E7C878] transition duration-700 group-hover:w-full" />
        </div>
      </motion.div>
    </Reveal>
  );
}

function ExperienceCards() {
  return (
    <section
      id="features"
      className="relative bg-[#0B0B0A] px-6 py-28 text-[#F6F1E8] sm:px-8"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(201,164,92,.12),transparent_38%)]" />

      <div className="relative mx-auto w-full max-w-[1760px]">
        <Reveal className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C878]">
            Features
          </p>

          <h2 className="mt-4 text-[clamp(3.5rem,7vw,7rem)] font-light leading-[0.92] tracking-[-0.07em]">
            Everything guests need.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {experienceCards.map((card, index) => (
            <TiltCard
              key={card.title}
              icon={card.icon}
              title={card.title}
              text={card.text}
              delay={index * 0.06}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ImageReveal({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <Reveal className={className}>
      <motion.div
        initial={{ clipPath: 'inset(18% 18% 18% 18% round 2rem)' }}
        whileInView={{ clipPath: 'inset(0% 0% 0% 0% round 2rem)' }}
        viewport={{ once: true, margin: '-120px' }}
        transition={{ duration: 1.1, ease }}
        className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_42px_140px_rgba(0,0,0,.45)]"
      >
        <motion.div
          whileHover={{ scale: 1.045 }}
          transition={{ duration: 0.8, ease }}
        >
          <Image
            src={src}
            alt={alt}
            width={1400}
            height={900}
            className="h-full min-h-[360px] w-full object-cover"
          />
        </motion.div>

        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent,rgba(231,200,120,.16),transparent)] transition duration-1000 group-hover:translate-x-full" />
      </motion.div>
    </Reveal>
  );
}

function CraftedSection() {
  return (
    <section
      id="design"
      className="relative overflow-hidden bg-[#030303] px-6 py-28 text-[#F6F1E8] sm:px-8"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(201,164,92,.14),transparent_34%)]" />

      <div className="relative mx-auto grid w-full max-w-[1760px] items-center gap-14 lg:grid-cols-[0.82fr_1.18fr]">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C878]">
            Craft
          </p>

          <h2 className="mt-4 text-[clamp(3.4rem,7vw,7rem)] font-light leading-[0.92] tracking-[-0.07em]">
            Designed to disappear.
            <span className="block text-[#E7C878]">Built to impress.</span>
          </h2>

          <p className="mt-7 max-w-xl text-lg font-light leading-8 text-white/50">
            Crystal-clear glass, brushed-gold mounts, and a presence that feels native to luxury rooms.
          </p>

          <div className="mt-10 grid gap-3">
            {luxuryDetails.map((item) => (
              <motion.div
                key={item}
                whileHover={{ x: 8 }}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 backdrop-blur-xl"
              >
                <CircleDot className="size-4 text-[#E7C878]" />
                <span className="font-light text-white/72">{item}</span>
              </motion.div>
            ))}
          </div>
        </Reveal>

        <div className="grid gap-5">
          <ImageReveal
            src={images.craftsmanship}
            alt="Crystal glass precision close-up"
          />
          <ImageReveal
            src={images.engineering}
            alt="Floating standoff detail"
          />
        </div>
      </div>
    </section>
  );
}

function PhonePanel() {
  const items = [
    { icon: <Utensils className="size-4" />, label: 'Order Food' },
    { icon: <Bell className="size-4" />, label: 'Request Service' },
    { icon: <BookOpen className="size-4" />, label: 'Hotel Guide' },
    { icon: <Waves className="size-4" />, label: 'Pool Info' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 60, rotate: 4 }}
      whileInView={{ opacity: 1, x: 0, rotate: 0 }}
      viewport={{ once: true, margin: '-120px' }}
      transition={{ duration: 1, ease }}
      className="relative mx-auto w-full max-w-[330px]"
    >
      <div className="absolute -inset-8 rounded-full bg-[#C9A45C]/20 blur-[80px]" />

      <div className="relative overflow-hidden rounded-[2.7rem] border border-white/14 bg-black p-3 shadow-[0_40px_120px_rgba(0,0,0,.58)]">
        <div className="rounded-[2.15rem] bg-[#0B0B0A] p-5">
          <div className="mx-auto mb-6 h-1.5 w-16 rounded-full bg-white/14" />

          <p className="text-xs font-light text-white/42">Welcome</p>
          <h3 className="mt-1 text-2xl font-light text-[#F6F1E8]">
            How can we help?
          </h3>

          <div className="mt-6 grid gap-3">
            {items.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: 0.25 + index * 0.09, ease }}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3"
              >
                <span className="flex items-center gap-3 text-sm font-light text-white/75">
                  <span className="text-[#E7C878]">{item.icon}</span>
                  {item.label}
                </span>

                <ArrowRight className="size-4 text-[#E7C878]" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute left-1/2 top-1/2 -z-10 grid size-56 -translate-x-1/2 -translate-y-1/2 place-items-center">
        <span className="absolute size-28 animate-ping rounded-full border border-[#E7C878]/25" />
        <span className="absolute size-40 animate-[ping_3s_ease-in-out_infinite] rounded-full border border-[#E7C878]/15" />
      </div>
    </motion.div>
  );
}

function InstantAccessSection() {
  return (
    <section className="relative overflow-hidden bg-[#0B0B0A] px-6 py-28 text-[#F6F1E8] sm:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_40%,rgba(201,164,92,.16),transparent_34%)]" />

      <div className="relative mx-auto grid w-full max-w-[1760px] items-center gap-14 lg:grid-cols-[1.12fr_0.88fr]">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.25rem] border border-white/10 shadow-[0_50px_160px_rgba(0,0,0,.52)]">
            <Image
              src={images.access}
              alt="Tap your phone instant access signage"
              width={1600}
              height={1000}
              className="h-[620px] w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/20 to-transparent" />
          </div>
        </Reveal>

        <div>
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C878]">
              Access
            </p>

            <h2 className="mt-4 text-[clamp(3.4rem,7vw,7rem)] font-light leading-[0.92] tracking-[-0.07em]">
              One tap.
              <span className="block text-[#E7C878]">Everything instantly.</span>
            </h2>

            <p className="mt-7 max-w-xl text-lg font-light leading-8 text-white/50">
              Guest info, services, dining, pool details, and hotel guidance — no app download.
            </p>
          </Reveal>

          <div className="mt-12">
            <PhonePanel />
          </div>
        </div>
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section className="relative bg-[#030303] px-6 py-28 text-[#F6F1E8] sm:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(201,164,92,.12),transparent_34%)]" />

      <div className="relative mx-auto w-full max-w-[1760px]">
        <Reveal className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C878]">
            Operators
          </p>

          <h2 className="mt-4 text-[clamp(3.5rem,7vw,7rem)] font-light leading-[0.92] tracking-[-0.07em]">
            Less front-desk pressure.
            <span className="block text-[#E7C878]">More guest delight.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-5">
          {benefits.map((item, index) => (
            <Reveal key={item} delay={index * 0.06}>
              <motion.div
                whileHover={{ y: -8 }}
                className="relative min-h-48 overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl"
              >
                <div className="absolute right-4 top-4 text-5xl font-light text-[#C9A45C]/18">
                  0{index + 1}
                </div>

                <CheckCircle2 className="size-5 text-[#E7C878]" />

                <p className="relative mt-16 text-xl font-light leading-7 text-white/80">
                  {item}
                </p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function GallerySection() {
  return (
    <section className="relative overflow-hidden bg-[#F6F1E8] px-6 py-28 text-[#111111] sm:px-8">
      <div className="mx-auto w-full max-w-[1760px]">
        <Reveal className="max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#927438]">
            Spaces
          </p>

          <h2 className="mt-4 text-[clamp(3.4rem,7vw,7rem)] font-light leading-[0.92] tracking-[-0.07em]">
            Built for rooms, suites, villas, and resorts.
          </h2>
        </Reveal>

        <Reveal className="mt-14">
          <div className="group relative overflow-hidden rounded-[2.5rem] border border-black/10 bg-black shadow-[0_48px_140px_rgba(0,0,0,.2)]">
            <motion.div
              whileHover={{ scale: 1.035 }}
              transition={{ duration: 0.9, ease }}
            >
              <Image
                src={images.gallery}
                alt="CloudView room experience collage"
                width={1800}
                height={1100}
                className="h-[760px] w-full object-cover"
              />
            </motion.div>

            <div className="absolute inset-0 bg-gradient-to-t from-black/64 via-transparent to-black/10" />

            <div className="absolute bottom-6 left-6 right-6 flex flex-wrap gap-3">
              {galleryLabels.map((label, index) => (
                <motion.span
                  key={label}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.55, delay: index * 0.08, ease }}
                  className="rounded-full border border-white/16 bg-white/10 px-4 py-2 text-sm font-light text-white backdrop-blur-xl"
                >
                  {label}
                </motion.span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AdminScreenFrame({
  screen,
}: {
  screen: (typeof adminScreens)[number];
}) {
  const reduceMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-0.5, 0.5], [5, -5]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-6, 6]);

  function handleMove(event: MouseEvent<HTMLDivElement>) {
    if (reduceMotion) return;

    const rect = event.currentTarget.getBoundingClientRect();

    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function handleLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{
        rotateX: reduceMotion ? 0 : rotateX,
        rotateY: reduceMotion ? 0 : rotateY,
        transformStyle: 'preserve-3d',
      }}
      className="relative"
    >
      <div className="absolute -inset-8 rounded-full bg-[#C9A45C]/20 blur-[110px]" />

      <motion.div
        key={screen.src}
        initial={{ opacity: 0, y: 34, scale: 0.96, filter: 'blur(14px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.9, ease }}
        className="group relative overflow-hidden rounded-[2.25rem] border border-white/12 bg-white/[0.05] shadow-[0_60px_180px_rgba(0,0,0,.55)] backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-black/55 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-red-400/80" />
            <span className="size-3 rounded-full bg-[#E7C878]/80" />
            <span className="size-3 rounded-full bg-emerald-400/80" />
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/38">
            CloudView Admin OS
          </p>
        </div>

        <div className="relative overflow-hidden bg-[#050505]">
          <Image
            src={screen.src}
            alt={screen.title}
            width={1800}
            height={1000}
            className="h-[360px] w-full object-cover object-top transition duration-700 group-hover:scale-[1.025] md:h-[560px]"
            sizes="(max-width: 768px) 100vw, 70vw"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

          <div className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent,rgba(231,200,120,.16),transparent)] transition duration-1000 group-hover:translate-x-full" />

          <div className="absolute bottom-5 left-5 right-5 rounded-[1.5rem] border border-white/12 bg-black/58 p-4 backdrop-blur-2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#E7C878]">
                  {screen.label}
                </p>

                <h3 className="mt-2 text-2xl font-light text-[#F6F1E8] md:text-3xl">
                  {screen.title}
                </h3>

                <p className="mt-2 max-w-xl text-sm font-light leading-6 text-white/48">
                  {screen.text}
                </p>
              </div>

              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/12 px-3 py-1 text-xs font-semibold text-emerald-100">
                <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,.9)]" />
                Live
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AdminMiniCarousel({
  activeIndex,
  onSelect,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mt-10 overflow-hidden">
      <motion.div
        animate={reduceMotion ? undefined : { x: ['0%', '-50%'] }}
        transition={{
          duration: 36,
          repeat: Infinity,
          ease: 'linear',
        }}
        className="flex w-max gap-4"
      >
        {[...adminScreens, ...adminScreens].map((screen, index) => {
          const realIndex = index % adminScreens.length;
          const active = realIndex === activeIndex;

          return (
            <button
              key={`${screen.label}-${index}`}
              type="button"
              onClick={() => onSelect(realIndex)}
              className={cn(
                'group relative h-28 w-48 shrink-0 overflow-hidden rounded-2xl border transition duration-500 md:h-36 md:w-64',
                active
                  ? 'border-[#E7C878]/70 shadow-[0_22px_70px_rgba(201,164,92,.2)]'
                  : 'border-white/10 opacity-55 hover:opacity-100'
              )}
            >
              <Image
                src={screen.src}
                alt=""
                width={420}
                height={250}
                className="h-full w-full object-cover object-top transition duration-700 group-hover:scale-105"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

              <p className="absolute bottom-3 left-3 right-3 truncate text-left text-xs font-semibold text-white">
                {screen.label}
              </p>
            </button>
          );
        })}
      </motion.div>

      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#030303] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#030303] to-transparent" />
    </div>
  );
}

function PlatformSection() {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);

  const activeScreen = adminScreens[activeIndex] ?? adminScreens[0];

  useEffect(() => {
    if (reduceMotion) return;

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % adminScreens.length);
    }, 4800);

    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <section
      id="platform"
      className="relative overflow-hidden bg-[#030303] px-6 py-28 text-[#F6F1E8] sm:px-8"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(201,164,92,.18),transparent_30%),linear-gradient(#030303,#0B0B0A)]" />

      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,.28)_1px,transparent_0)] [background-size:32px_32px]" />

      <div className="relative mx-auto w-full max-w-[1760px]">
        <Reveal className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C878]">
              Admin OS
            </p>

            <h2 className="mt-4 text-[clamp(3.4rem,7vw,7rem)] font-light leading-[0.92] tracking-[-0.07em]">
              Your hotel,
              <span className="block text-[#E7C878]">live.</span>
            </h2>
          </div>

          <p className="max-w-xl text-lg font-light leading-8 text-white/48 lg:ml-auto">
            A luxury operations layer for orders, guests, NFC access, kitchen flow,
            analytics, and reports.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-8 lg:grid-cols-[310px_1fr]">
          <Reveal>
            <div className="sticky top-28 grid gap-3 rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 backdrop-blur-2xl">
              {adminScreens.map((screen, index) => {
                const active = index === activeIndex;

                return (
                  <button
                    key={screen.label}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      'group rounded-[1.35rem] border px-4 py-4 text-left transition duration-500',
                      active
                        ? 'border-[#E7C878]/55 bg-[#C9A45C]/14 shadow-[0_16px_50px_rgba(201,164,92,.14)]'
                        : 'border-white/8 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.06]'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={cn(
                          'text-xs font-semibold uppercase tracking-[0.22em]',
                          active ? 'text-[#E7C878]' : 'text-white/38'
                        )}
                      >
                        {screen.label}
                      </span>

                      <span
                        className={cn(
                          'grid size-7 place-items-center rounded-full border transition',
                          active
                            ? 'border-[#E7C878]/40 bg-[#C9A45C]/20 text-[#E7C878]'
                            : 'border-white/10 text-white/35'
                        )}
                      >
                        <ArrowRight className="size-3.5" />
                      </span>
                    </div>

                    <p
                      className={cn(
                        'mt-3 text-lg font-light leading-6',
                        active ? 'text-[#F6F1E8]' : 'text-white/55'
                      )}
                    >
                      {screen.title}
                    </p>

                    <div className="mt-4 h-px overflow-hidden bg-white/8">
                      <motion.div
                        animate={{
                          width: active ? '100%' : '0%',
                        }}
                        transition={{ duration: 4.8, ease: 'linear' }}
                        className="h-full bg-[#E7C878]"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </Reveal>

          <AdminScreenFrame screen={activeScreen} />
        </div>

        <AdminMiniCarousel
          activeIndex={activeIndex}
          onSelect={setActiveIndex}
        />
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="bg-[#0B0B0A] px-6 py-28 text-[#F6F1E8] sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C878]">
            FAQ
          </p>

          <h2 className="mt-4 text-[clamp(3.4rem,7vw,6.4rem)] font-light leading-[0.92] tracking-[-0.07em]">
            Simple answers.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-3">
          {faqs.map((faq, index) => (
            <Reveal key={faq.question} delay={index * 0.04}>
              <details className="group rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-light">
                  {faq.question}
                  <ChevronDown className="size-5 text-[#E7C878] transition group-open:rotate-180" />
                </summary>

                <p className="mt-4 max-w-2xl text-sm font-light leading-7 text-white/48">
                  {faq.answer}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section id="demo" className="relative overflow-hidden bg-[#030303] px-6 py-32 text-[#F6F1E8] sm:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(201,164,92,.2),transparent_34%)]" />

      <div className="pointer-events-none absolute left-1/2 top-1/2 grid size-[520px] -translate-x-1/2 -translate-y-1/2 place-items-center opacity-50">
        <span className="absolute size-48 animate-ping rounded-full border border-[#E7C878]/16" />
        <span className="absolute size-72 animate-[ping_3.2s_ease-in-out_infinite] rounded-full border border-[#E7C878]/10" />
        <span className="absolute size-96 animate-[ping_4.2s_ease-in-out_infinite] rounded-full border border-[#E7C878]/8" />
      </div>

      <Reveal className="relative mx-auto max-w-5xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#E7C878]">
          CloudView
        </p>

        <h2 className="mt-5 text-[clamp(4rem,9vw,9rem)] font-light leading-[0.88] tracking-[-0.08em]">
          Make every room feel smarter.
        </h2>

        <p className="mx-auto mt-7 max-w-xl text-lg font-light leading-8 text-white/55">
          Launch a premium guest portal powered by one simple tap.
        </p>

        <div className="mt-10">
          <MagneticButton href="/dashboard/login">Request a Demo</MagneticButton>
        </div>
      </Reveal>
    </section>
  );
}

export default function CloudViewLandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#030303]">
      <style>{`
        html {
          scroll-behavior: smooth;
        }

        .perspective-\\[1200px\\] {
          perspective: 1200px;
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            scroll-behavior: auto !important;
          }
        }
      `}</style>

     <HeroSection />
      <ScrollStory />
      <ExperienceCards />
      <CraftedSection />
      <InstantAccessSection />
      <GuestPortalShowcaseSection />
      <PlatformSection />
      <BenefitsSection />
      <GallerySection />
      <FaqSection />
      <FinalCTA />

      <footer className="border-t border-white/8 bg-[#030303] px-6 py-10 text-[#F6F1E8] sm:px-8">
        <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <BrandMark />

          <div className="flex flex-wrap gap-6 text-sm font-light text-white/42">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-white">
                {item.label}
              </Link>
            ))}
            <Link href="/dashboard/login" className="transition hover:text-white">
              Login
            </Link>
          </div>

          <p className="text-sm font-light text-white/32">
            © 2026 CloudView.
          </p>
        </div>
      </footer>
    </main>
  );
}