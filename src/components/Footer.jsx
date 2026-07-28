import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { documents } from "../documents.js";

const footerNavigation = [
  { to: "/#programs", label: "Направления" },
  { to: "/#process", label: "Как проходит обучение" },
  { to: "/#advantages", label: "Почему мы" },
  { to: "/#reviews", label: "Отзывы" },
  { to: "/#faq", label: "Вопросы и ответы" },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__lead">
        <div>
          <span className="section-index section-index--light">Есть вопросы?</span>
          <h2>
            Поможем выбрать
            <br />
            направление
          </h2>
        </div>
        <Link className="button button--accent" to="/#request">
          Связаться с координатором
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>

      <div className="container footer__main">
        <div className="footer__brand">
          <Link className="logo logo--footer" to="/">
            <span className="logo__mark">С</span>
            <span>
              <strong>СМЕНА</strong>
              <small>центр подготовки</small>
            </span>
          </Link>
          <p>
            Практическая подготовка специалистов ресторанной индустрии.
          </p>
          <div className="footer__contacts">
            <strong>+7 (000) 000-00-00</strong>
            <span>hello@smena.center</span>
            <span>Москва · адрес уточняется</span>
          </div>
        </div>

        <nav className="footer__column" aria-label="Разделы сайта">
          <h3>Разделы</h3>
          {footerNavigation.map((item) => (
            <Link to={item.to} key={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>

        <nav className="footer__column footer__column--documents" aria-label="Документы">
          <h3>Документы</h3>
          <Link className="footer__all-documents" to="/documents">
            Все документы
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          {documents.map((document) => (
            <Link to={`/documents/${document.slug}`} key={document.slug}>
              {document.shortTitle}
            </Link>
          ))}
        </nav>
      </div>

      <div className="container footer__bottom">
        <span>© 2026 СМЕНА</span>
        <span>Информация и реквизиты на сайте являются предварительными</span>
        <Link to="/documents/privacy">Политика конфиденциальности</Link>
      </div>
    </footer>
  );
}
