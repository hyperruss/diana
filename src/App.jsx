import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  BriefcaseBusiness,
  ClipboardCheck,
  Clock3,
  Coffee,
  Compass,
  ConciergeBell,
  GraduationCap,
  Martini,
  MessagesSquare,
  Quote,
  Repeat2,
  Sparkles,
  Users,
} from "lucide-react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import Header from "./components/Header.jsx";
import FaqAccordion from "./components/FaqAccordion.jsx";
import RequestForm from "./components/RequestForm.jsx";
import Footer from "./components/Footer.jsx";
import {
  DocumentPage,
  DocumentsIndexPage,
  NotFoundPage,
} from "./pages/DocumentsPage.jsx";
import PaymentPage from "./pages/PaymentPage.jsx";
import { advantages, learningSteps, programs, reviews } from "./data.js";
import heroImage from "../assets/hero-hospitality-training.png";

const programIcons = {
  martini: Martini,
  coffee: Coffee,
  bell: ConciergeBell,
  users: Users,
  clipboard: ClipboardCheck,
  briefcase: BriefcaseBusiness,
};

const advantageIcons = {
  practice: Repeat2,
  mentor: GraduationCap,
  materials: BookOpenText,
  career: Compass,
  program: Sparkles,
};

const revealDelay = (index) => {
  if (index === 1) return " reveal--delay";
  if (index === 2) return " reveal--delay-2";
  if (index === 3) return " reveal--delay-3";
  return "";
};

const formatPrice = (price) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);

function useRevealOnScroll() {
  useEffect(() => {
    const elements = document.querySelectorAll(".reveal");

    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px" },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
}

function RouteScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const scrollToRoute = () => {
      if (hash) {
        const target = document.querySelector(hash);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    const frame = window.requestAnimationFrame(scrollToRoute);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, hash]);

  return null;
}

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero__media" aria-hidden="true">
        <img src={heroImage} alt="" fetchPriority="high" />
      </div>
      <div className="hero__scrim" />

      <div className="container hero__inner">
        <div className="hero__content">
          <div className="eyebrow eyebrow--light">
            <span>Центр ресторанных профессий</span>
            <span>Москва</span>
          </div>
          <h1>
            Освой профессию,
            <em>которая нужна</em>
            индустрии
          </h1>
          <p className="hero__lead">
            Практическая подготовка специалистов ресторанной сферы:
            от первых навыков до уверенного старта в профессии.
          </p>
          <div className="hero__actions">
            <a className="button button--accent" href="#request">
              Подобрать направление
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <a className="text-link text-link--light" href="#process">
              Как проходит обучение
              <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="hero__aside">
          <span className="hero__aside-number">01</span>
          <p>Не только теория</p>
          <strong>
            Отрабатываем навыки в условиях, близких к реальной смене
          </strong>
        </div>
      </div>

      <div className="container hero__professions" aria-label="Направления обучения">
        {programs.map((program) => (
          <a key={program.id} href={`#program-${program.id}`}>
            {program.title}
          </a>
        ))}
      </div>
    </section>
  );
}

function Principles() {
  const items = [
    ["Обучение", "Понятная база без лишней теории"],
    ["Практика", "Отработка действий и сценариев"],
    ["Сопровождение", "Обратная связь от наставников"],
    ["Помощь после", "Поддержка на старте карьеры"],
  ];

  return (
    <section className="principles" aria-label="Основа обучения">
      <div className="container principles__grid">
        <div className="principles__intro reveal">
          <span className="section-index">01 / Основа</span>
          <p>Четыре опоры программы</p>
        </div>
        <ol className="principles__list">
          {items.map(([title, description], index) => (
            <li
              className={`reveal${revealDelay(index)}`}
              key={title}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{title}</strong>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Programs() {
  return (
    <section className="programs section" id="programs">
      <div className="container">
        <div className="section-heading reveal">
          <div>
            <span className="section-index">02 / Направления</span>
            <h2>
              Выбери свою роль
              <br />в команде
            </h2>
          </div>
          <p>
            Начать можно без опыта. Поможем определить направление
            по интересам, задачам и желаемому формату работы.
          </p>
        </div>

        <div className="program-grid">
          {programs.map((program, index) => {
            const Icon = programIcons[program.icon];

            return (
              <article
                className={`program-card program-card--${program.variant} reveal${revealDelay(
                  index % 3,
                )}`}
                id={`program-${program.id}`}
                key={program.id}
              >
                <div className="program-card__top">
                  <span>{program.number}</span>
                  <span className="program-card__icon" aria-hidden="true">
                    <Icon size={21} strokeWidth={1.6} />
                  </span>
                </div>
                <div>
                  <p className="program-card__label">{program.label}</p>
                  <h3>{program.title}</h3>
                  <p>{program.description}</p>
                </div>
                <div className="program-card__facts">
                  <span>
                    <Clock3 size={15} aria-hidden="true" />
                    {program.duration}
                  </span>
                  <span>{program.lessonLength}</span>
                </div>
                <div className="program-card__footer">
                  <div className="program-card__price">
                    <small>Стоимость</small>
                    <strong>{formatPrice(program.price)}</strong>
                  </div>
                  {program.enrollmentClosed ? (
                    <button
                      className="program-card__pay program-card__pay--closed"
                      type="button"
                      disabled
                      title="Набор на программу закрыт"
                    >
                      Набор закрыт
                    </button>
                  ) : (
                    <Link
                      className="program-card__pay"
                      to={`/payment/${program.id}`}
                    >
                      Перейти к оплате
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Process() {
  return (
    <section className="process section" id="process">
      <div className="container process__layout">
        <div className="process__sticky reveal">
          <span className="section-index section-index--light">03 / Как учим</span>
          <h2>
            От знакомства
            <br />
            до практики
          </h2>
          <p>
            Программа выстроена последовательно: сначала база,
            затем отработка навыков и подготовка к реальным рабочим задачам.
          </p>
          <a className="button button--ghost" href="#request">
            Обсудить обучение
          </a>
        </div>

        <ol className="timeline">
          {learningSteps.map((step) => (
            <li
              className={`timeline__item${
                step.accent ? " timeline__item--accent" : ""
              } reveal`}
              key={step.number}
            >
              <span className="timeline__number">{step.number}</span>
              <div>
                <p className="timeline__tag">{step.tag}</p>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Advantages() {
  return (
    <section className="advantages section" id="advantages">
      <div className="container">
        <div className="section-heading section-heading--compact reveal">
          <div>
            <span className="section-index">04 / Почему мы</span>
            <h2>
              Всё, что помогает
              <br />
              стать увереннее
            </h2>
          </div>
        </div>

        <div className="advantage-grid">
          {advantages.map((advantage, index) => {
            const Icon = advantageIcons[advantage.icon];

            return (
              <article
                className={`advantage-card${
                  advantage.wide ? " advantage-card--wide" : ""
                } reveal${revealDelay(index % 3)}`}
                key={advantage.number}
              >
                <span>{advantage.number}</span>
                <div className="advantage-card__symbol" aria-hidden="true">
                  <Icon size={25} strokeWidth={1.5} />
                </div>
                <div>
                  <h3>{advantage.title}</h3>
                  <p>{advantage.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Reviews() {
  const [activeReview, setActiveReview] = useState(0);
  const review = reviews[activeReview];

  const showReview = (index) => {
    const nextIndex = (index + reviews.length) % reviews.length;
    setActiveReview(nextIndex);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowLeft") showReview(activeReview - 1);
    if (event.key === "ArrowRight") showReview(activeReview + 1);
  };

  return (
    <section className="reviews section" id="reviews">
      <div className="container reviews__layout">
        <div className="reviews__intro reveal">
          <span className="section-index">05 / Отзывы</span>
          <h2>
            Что говорят
            <br />
            участники
          </h2>
          <p>
            Впечатления после практики, общения с наставниками
            и первых уверенных шагов в профессии.
          </p>
          <div className="reviews__controls">
            <button
              type="button"
              aria-label="Предыдущий отзыв"
              onClick={() => showReview(activeReview - 1)}
            >
              <ArrowLeft size={21} aria-hidden="true" />
            </button>
            <span>
              {String(activeReview + 1).padStart(2, "0")} /{" "}
              {String(reviews.length).padStart(2, "0")}
            </span>
            <button
              type="button"
              aria-label="Следующий отзыв"
              onClick={() => showReview(activeReview + 1)}
            >
              <ArrowRight size={21} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          className="reviews__slider reveal reveal--delay"
          tabIndex="0"
          role="region"
          aria-label="Отзывы участников"
          aria-live="polite"
          onKeyDown={handleKeyDown}
        >
          <Quote className="reviews__quote-icon" size={54} strokeWidth={1.2} />
          <div className="reviews__slide" key={activeReview}>
            <blockquote>«{review.text}»</blockquote>
            <div className="reviews__author">
              <span className="reviews__avatar" aria-hidden="true">
                {review.name.charAt(0)}
              </span>
              <div>
                <strong>{review.name}</strong>
                <span>{review.program}</span>
              </div>
            </div>
          </div>
          <div className="reviews__dots" aria-label="Выбрать отзыв">
            {reviews.map((item, index) => (
              <button
                className={index === activeReview ? "is-active" : ""}
                type="button"
                aria-label={`Отзыв ${index + 1}: ${item.name}`}
                aria-current={index === activeReview ? "true" : undefined}
                onClick={() => showReview(index)}
                key={item.name}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="faq-preview section" id="faq">
      <div className="container faq-preview__layout">
        <div className="faq-preview__intro reveal">
          <span className="section-index">06 / Вопросы</span>
          <h2>
            Спросить —
            <br />
            это нормально
          </h2>
          <p>
            Собрали ответы о занятиях, практике,
            сопровождении и условиях обучения.
          </p>
          <a className="text-link" href="#request">
            Задать свой вопрос
            <MessagesSquare size={16} aria-hidden="true" />
          </a>
        </div>
        <FaqAccordion />
      </div>
    </section>
  );
}

function Request() {
  return (
    <section className="request section" id="request">
      <div className="container request__card">
        <div className="request__copy reveal">
          <span className="section-index section-index--light">07 / Заявка</span>
          <h2>
            Давайте найдём
            <br />
            ваше направление
          </h2>
          <p>
            Оставьте контакты. Координатор расскажет о программах,
            формате занятий и поможет выбрать подходящий вариант.
          </p>
          <div className="request__meta">
            <span>Без опыта — можно</span>
            <span>Подберём программу</span>
            <span>Ответим на вопросы</span>
          </div>
        </div>
        <RequestForm />
      </div>
    </section>
  );
}

function HomePage() {
  useRevealOnScroll();

  return (
    <>
      <Hero />
      <Principles />
      <Programs />
      <Process />
      <Advantages />
      <Reviews />
      <Faq />
      <Request />
    </>
  );
}

function AppRoutes() {
  return (
    <>
      <RouteScrollManager />
      <a className="skip-link" href="#main">
        Перейти к содержанию
      </a>
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/payment/:programId" element={<PaymentPage />} />
          <Route path="/documents" element={<DocumentsIndexPage />} />
          <Route path="/documents/:slug" element={<DocumentPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
