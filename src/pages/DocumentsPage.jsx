import {
  ArrowLeft,
  ArrowRight,
  Download,
  ExternalLink,
  FileText,
} from "lucide-react";
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
            Здесь собраны документы, регулирующие оформление заявки, оплату,
            обработку персональных данных и получение рекламных рассылок.
          </p>
        </div>

        <div className="documents-notice">
          <strong>Документы центра</strong>
          <p>
            Оператор сайта — Индивидуальный предприниматель Григорьев Станислав
            Антанович, ИНН 501723052937, ОГРНИП 326508100437513.
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
            <span className="section-index">Документ / smena-academy.ru</span>
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
              <strong>Опубликованная редакция</strong>
              <p>Редакция: {legalDocument.updatedAt}</p>
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
            <div className="document-file-actions">
              <a
                className="button button--dark"
                href={legalDocument.pdfPath}
                target="_blank"
                rel="noreferrer"
              >
                Открыть PDF
                <ExternalLink size={17} aria-hidden="true" />
              </a>
              <a
                className="text-link"
                href={legalDocument.docxPath}
                download
              >
                Скачать DOCX
                <Download size={17} aria-hidden="true" />
              </a>
            </div>

            <iframe
              className="document-viewer"
              src={`${legalDocument.pdfPath}#view=FitH`}
              title={legalDocument.title}
            />

            <p className="document-viewer__fallback">
              Если документ не отображается во встроенном просмотрщике, откройте
              его в формате PDF или скачайте исходный файл DOCX по ссылкам выше.
            </p>
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
