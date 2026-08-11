import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { programs } from "../data.js";
import { NotFoundPage } from "./DocumentsPage.jsx";

const formatPrice = (price) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(price);

const initialForm = {
  name: "",
  phone: "",
  email: "",
  offerAccepted: false,
  personalDataAccepted: false,
  marketingAccepted: false,
};

export default function PaymentPage() {
  const { programId } = useParams();
  const program = programs.find((item) => item.id === programId);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!program) return <NotFoundPage />;

  if (program.enrollmentClosed) {
    return (
      <section className="payment-page payment-page--unavailable">
        <div className="container payment-unavailable">
          <span className="section-index">Оплата недоступна</span>
          <h1>Набор на программу закрыт</h1>
          <p>
            Сейчас записаться на направление «{program.title}» нельзя. Вернитесь
            к программам и выберите открытый набор.
          </p>
          <Link className="button button--dark" to={`/#program-${program.id}`}>
            Вернуться к направлениям
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  const updateForm = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    setError("");
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/payments/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          name: form.name,
          phone: form.phone,
          email: form.email,
          consents: {
            offer: form.offerAccepted,
            personalData: form.personalDataAccepted,
            privacy: form.personalDataAccepted,
            marketing: form.marketingAccepted,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.paymentUrl) {
        throw new Error(payload.error || "Не удалось перейти к оплате.");
      }

      window.location.assign(payload.paymentUrl);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось перейти к оплате.",
      );
      setSubmitting(false);
    }
  };

  return (
    <section className="payment-page">
      <div className="container">
        <Link className="payment-back" to={`/#program-${program.id}`}>
          <ArrowLeft size={17} aria-hidden="true" />
          Вернуться к направлениям
        </Link>

        <header className="payment-header">
          <div>
            <span className="section-index">Оформление участия</span>
            <h1>Запись и оплата</h1>
          </div>
          <p>
            Заполните контактные данные и подтвердите согласие с документами.
            После нажатия кнопки откроется защищённая платёжная страница Т‑Банка.
          </p>
        </header>

        <div className="payment-layout">
          <form className="payment-form" onSubmit={submitPayment}>
            <div className="payment-form__heading">
              <span>01 / Данные плательщика</span>
              <h2>Контактные данные</h2>
              <p>
                Контакты понадобятся для оформления оплаты и связи по выбранной
                программе. Данные банковской карты на этом сайте не вводятся.
              </p>
            </div>

            <div className="payment-form__grid">
              <label className="payment-field">
                <span>Имя и фамилия</span>
                <input
                  name="name"
                  value={form.name}
                  onChange={updateForm}
                  placeholder="Анна Иванова"
                  autoComplete="name"
                  minLength="2"
                  maxLength="100"
                  required
                />
              </label>

              <label className="payment-field">
                <span>Телефон</span>
                <input
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={updateForm}
                  placeholder="+7 (999) 000-00-00"
                  autoComplete="tel"
                  maxLength="40"
                  required
                />
              </label>
            </div>

            <label className="payment-field">
              <span>Электронная почта</span>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={updateForm}
                placeholder="name@example.ru"
                autoComplete="email"
                maxLength="254"
                required
              />
            </label>

            <fieldset className="payment-consents">
              <legend>02 / Подтверждение условий</legend>

              <label className="payment-consent">
                <input
                  name="offerAccepted"
                  type="checkbox"
                  checked={form.offerAccepted}
                  onChange={updateForm}
                  required
                />
                <span>
                  Я принимаю условия{" "}
                  <Link to="/documents/offer" target="_blank" rel="noreferrer">
                    публичной оферты
                  </Link>
                  .
                </span>
              </label>

              <label className="payment-consent">
                <input
                  name="personalDataAccepted"
                  type="checkbox"
                  checked={form.personalDataAccepted}
                  onChange={updateForm}
                  required
                />
                <span>
                  Я даю{" "}
                  <Link
                    to="/documents/personal-data"
                    target="_blank"
                    rel="noreferrer"
                  >
                    согласие на обработку персональных данных
                  </Link>{" "}
                  в соответствии с{" "}
                  <Link
                    to="/documents/privacy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    политикой конфиденциальности
                  </Link>
                  .
                </span>
              </label>

              <label className="payment-consent">
                <input
                  name="marketingAccepted"
                  type="checkbox"
                  checked={form.marketingAccepted}
                  onChange={updateForm}
                />
                <span>
                  Я согласен получать новости и предложения центра. Это
                  необязательно для оплаты.
                </span>
              </label>
            </fieldset>

            <button
              className="button button--accent button--full payment-form__submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Создаём платёж…" : `Оплатить ${formatPrice(program.price)}`}
              {submitting ? (
                <LoaderCircle className="payment-spinner" size={18} aria-hidden="true" />
              ) : (
                <ArrowRight size={18} aria-hidden="true" />
              )}
            </button>

            {error && (
              <div className="payment-form__status payment-form__status--error" role="alert">
                <XCircle size={18} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
          </form>

          <aside className="payment-summary">
            <div>
              <span className="section-index section-index--light">Ваш заказ</span>
              <span className="payment-summary__number">{program.number}</span>
            </div>
            <p className="payment-summary__label">{program.label}</p>
            <h2>{program.title}</h2>
            <p className="payment-summary__description">{program.description}</p>
            <div className="payment-summary__facts">
              <span>
                <Clock3 size={16} aria-hidden="true" />
                {program.duration}
              </span>
              <span>{program.lessonLength}</span>
            </div>
            <dl>
              <div>
                <dt>Стоимость программы</dt>
                <dd>{formatPrice(program.price)}</dd>
              </div>
              <div className="payment-summary__total">
                <dt>К оплате</dt>
                <dd>{formatPrice(program.price)}</dd>
              </div>
            </dl>
            <div className="payment-summary__secure">
              <ShieldCheck size={21} aria-hidden="true" />
              <p>
                Реквизиты банковской карты вводятся только на защищённой странице
                Т‑Банка и не передаются сайту центра.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

const failedStatuses = new Set([
  "INIT_FAILED",
  "REJECTED",
  "CANCELED",
  "REVERSED",
  "REFUNDED",
  "DEADLINE_EXPIRED",
  "ATTEMPTS_EXPIRED",
]);

export function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId") || "";
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let timeoutId;
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const response = await fetch(
          `/api/payments/status?orderId=${encodeURIComponent(orderId)}`,
          { headers: { Accept: "application/json" }, cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Заказ не найден.");
        if (!active) return;

        setPayment(payload);
        setError("");
        attempts += 1;

        if (!payload.terminal && attempts < 48) {
          timeoutId = window.setTimeout(checkStatus, 2500);
        }
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Не удалось проверить платёж.",
        );
      }
    };

    if (orderId) checkStatus();
    else setError("В ссылке отсутствует номер заказа.");

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [orderId]);

  const isConfirmed = payment?.status === "CONFIRMED";
  const isFailed = payment && failedStatuses.has(payment.status);

  return (
    <section className="payment-page payment-result-page">
      <div className="container payment-result">
        <span className="section-index">Статус оплаты</span>

        {!payment && !error && (
          <>
            <LoaderCircle className="payment-spinner payment-result__icon" aria-hidden="true" />
            <h1>Проверяем платёж</h1>
            <p>Ожидаем подтверждение от банка. Обычно это занимает несколько секунд.</p>
          </>
        )}

        {isConfirmed && (
          <>
            <CheckCircle2 className="payment-result__icon" aria-hidden="true" />
            <h1>Оплата подтверждена</h1>
            <p>
              Заказ на программу «{payment.programTitle}» оплачен. Мы свяжемся с
              вами по указанным при оформлении контактам.
            </p>
          </>
        )}

        {payment && !isConfirmed && !isFailed && (
          <>
            <LoaderCircle className="payment-spinner payment-result__icon" aria-hidden="true" />
            <h1>Ждём подтверждение</h1>
            <p>
              Банк ещё обрабатывает платёж. Не закрывайте страницу — статус
              обновится автоматически.
            </p>
          </>
        )}

        {(isFailed || error) && (
          <>
            <XCircle className="payment-result__icon" aria-hidden="true" />
            <h1>Оплата не подтверждена</h1>
            <p>{error || "Банк не подтвердил операцию. Деньги за этот заказ не считаются полученными."}</p>
          </>
        )}

        {payment && (
          <dl className="payment-result__details">
            <div>
              <dt>Заказ</dt>
              <dd>{payment.orderId}</dd>
            </div>
            <div>
              <dt>Сумма</dt>
              <dd>{formatPrice(payment.amount / 100)}</dd>
            </div>
          </dl>
        )}

        <div className="payment-result__actions">
          {payment?.programId && !isConfirmed && (
            <Link className="button button--accent" to={`/payment/${payment.programId}`}>
              Попробовать снова
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
          <Link className="text-link" to="/">
            Вернуться на главную
          </Link>
        </div>
      </div>
    </section>
  );
}
