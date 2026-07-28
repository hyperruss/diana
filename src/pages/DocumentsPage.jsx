import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { documents, getDocumentBySlug } from "../documents.js";

export function DocumentsIndexPage() {
  return (
    <section className="documents-page">
      <div className="container">
        <div className="documents-hero">
          <div>
            <span className="section-index">Правовая информация</span>
            <h1>Документы</h1>
          </div>
          <p>
            Здесь собраны правила работы сайта и предварительные версии
            документов, связанных с заявками, оплатой и персональными данными.
          </p>
        </div>

        <div className="documents-notice">
          <strong>Черновые редакции</strong>
          <p>
            Тексты подготовлены для прототипа. Перед запуском оплаты
            и публикацией реквизитов документы необходимо проверить
            и утвердить с юристом.
          </p>
        </div>

        <div className="documents-grid">
          {documents.map((document, index) => (
            <Link
              className="document-card"
              to={`/documents/${document.slug}`}
              key={document.slug}
            >
              <span className="document-card__number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <FileText size={29} strokeWidth={1.4} aria-hidden="true" />
              <div>
                <h2>{document.title}</h2>
                <p>{document.description}</p>
              </div>
              <span className="document-card__link">
                Открыть документ
                <ArrowRight size={17} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DocumentPage() {
  const { slug } = useParams();
  const legalDocument = getDocumentBySlug(slug);

  if (!legalDocument) {
    return <NotFoundPage />;
  }

  return (
    <article className="document-page">
      <div className="container">
        <div className="document-breadcrumbs">
          <Link to="/">Главная</Link>
          <span>/</span>
          <Link to="/documents">Документы</Link>
          <span>/</span>
          <span>{legalDocument.shortTitle}</span>
        </div>

        <header className="document-header">
          <div>
            <span className="section-index">Документ / черновая редакция</span>
            <h1>{legalDocument.title}</h1>
          </div>
          <p>{legalDocument.description}</p>
        </header>

        <div className="document-layout">
          <aside className="document-sidebar">
            <Link className="document-back" to="/documents">
              <ArrowLeft size={17} aria-hidden="true" />
              Все документы
            </Link>
            <div className="document-status">
              <span>Статус</span>
              <strong>Предварительная версия</strong>
              <p>Обновлено: 28 июля 2026</p>
            </div>
            <nav aria-label="Другие документы">
              <span>Другие документы</span>
              {documents
                .filter((document) => document.slug !== legalDocument.slug)
                .map((document) => (
                  <Link to={`/documents/${document.slug}`} key={document.slug}>
                    {document.shortTitle}
                  </Link>
                ))}
            </nav>
          </aside>

          <div className="document-content">
            <div className="document-draft-note">
              Этот текст является примерным и будет обновлён после утверждения
              реквизитов, способов оплаты и окончательных условий программ.
            </div>
            {legalDocument.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export function NotFoundPage() {
  return (
    <section className="not-found-page">
      <div className="container">
        <span className="section-index">Ошибка 404</span>
        <h1>Такой страницы нет</h1>
        <p>Возможно, адрес изменился или ссылка была указана неверно.</p>
        <Link className="button button--dark" to="/">
          Вернуться на главную
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
