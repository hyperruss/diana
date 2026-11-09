import { useEffect, useRef, useState } from "react";
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
  const [installmentConfig, setInstallmentConfig] = useState(null);
  const [installmentError, setInstallmentError] = useState("");
  const [installmentTerm, setInstallmentTerm] = useState(6);
  const [installmentSubmitting, setInstallmentSubmitting] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    let active = true;

    if (!program || program.enrollmentClosed) return undefined;

    fetch(`/api/installments/config?programId=${encodeURIComponent(program.id)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload.error || "Оплата в рассрочку временно недоступна.",
          );
        }
        if (active) {
          setInstallmentConfig(payload);
          setInstallmentTerm(payload.promoOptions?.[0]?.term || 6);
        }
      })
      .catch((requestError) => {
        if (!active) return;
        setInstallmentError(
          requestError instanceof Error
            ? requestError.message
            : "Оплата в рассрочку временно недоступна.",
        );
      });

    return () => {
      active = false;
    };
  }, [program]);

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

  const submitInstallment = async () => {
    if (installmentSubmitting) return;
    if (!formRef.current?.checkValidity()) {
      formRef.current?.reportValidity();
      setError(
        "Для заявки на рассрочку заполните контакты и примите обязательные условия.",
      );
      return;
    }

    setInstallmentSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/installments/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: program.id,
          installmentTerm,
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
      if (!response.ok || !payload.applicationUrl) {
        throw new Error(
          payload.error || "Не удалось открыть заявку на рассрочку.",
        );
      }
      window.location.assign(payload.applicationUrl);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось открыть заявку на рассрочку.",
      );
      setInstallmentSubmitting(false);
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
            Выберите оплату картой или подайте отдельную заявку на рассрочку
            через защищённую форму Т‑Банка.
          </p>
        </header>

        <div className="payment-layout">
          <form ref={formRef} className="payment-form" onSubmit={submitPayment}>
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
                  Я даю{" "}
                  <Link
                    to="/documents/marketing-consent"
                    target="_blank"
                    rel="noreferrer"
                  >
                    согласие на получение рекламных рассылок
                  </Link>
                  . Это необязательно для оплаты.
                </span>
              </label>
            </fieldset>

            <div className="payment-methods">
              <span className="payment-methods__label">03 / Способ оплаты</span>

              <button
                className="button button--accent button--full payment-form__submit"
                type="submit"
                disabled={submitting}
              >
                {submitting ? "Создаём платёж…" : "Оплатить картой"}
                {submitting ? (
                  <LoaderCircle className="payment-spinner" size={18} aria-hidden="true" />
                ) : (
                  <ArrowRight size={18} aria-hidden="true" />
                )}
              </button>

              <div className="payment-methods__divider" aria-hidden="true">
                <span>или</span>
              </div>

              {installmentConfig ? (
                <div className="payment-installment">
                  <label className="payment-installment__term">
                    <span>Срок рассрочки</span>
                    <select
                      value={installmentTerm}
                      onChange={(event) =>
                        setInstallmentTerm(Number(event.target.value))
                      }
                    >
                      {installmentConfig.promoOptions.map((option) => (
                        <option value={option.term} key={option.term}>
                          {option.text}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="button button--full payment-form__installment"
                    type="button"
                    disabled={installmentSubmitting || !installmentConfig.available}
                    onClick={submitInstallment}
                  >
                    {installmentSubmitting
                      ? "Создаём заявку…"
                      : "Оплатить в рассрочку"}
                    {installmentSubmitting ? (
                      <LoaderCircle
                        className="payment-spinner"
                        size={18}
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowRight size={18} aria-hidden="true" />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  className="button button--full payment-form__installment-placeholder"
                  type="button"
                  disabled
                >
                  Оплатить в рассрочку
                </button>
              )}

              <p className="payment-methods__note">
                Рассрочка оформляется отдельной заявкой. Условия и решение по
                заявке определяет Т‑Банк.
              </p>
              {installmentConfig && !installmentConfig.available && (
                <p className="payment-methods__unavailable">
                  Оформление рассрочки пока недоступно.
                </p>
              )}
              {installmentError && (
                <p className="payment-methods__unavailable">{installmentError}</p>
              )}
            </div>

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

function PaymentStatusResult({ installment = false }) {
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
          `${installment ? "/api/installments/status" : "/api/payments/status"}?orderId=${encodeURIComponent(orderId)}`,
          { headers: { Accept: "application/json" }, cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Заказ не найден.");
        if (!active) return;

        setPayment(payload);
        setError("");
        attempts += 1;

        if (!payload.terminal && attempts < 48) {
          timeoutId = window.setTimeout(checkStatus, installment ? 10_000 : 2500);
        }
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : installment
              ? "Не удалось проверить заявку на рассрочку."
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
  }, [installment, orderId]);

  const isConfirmed = payment?.status === "CONFIRMED";
  const isFailed = payment && failedStatuses.has(payment.status);

  return (
    <section className="payment-page payment-result-page">
      <div className="container payment-result">
        <span className="section-index">
          {installment ? "Статус рассрочки" : "Статус оплаты"}
        </span>

        {!payment && !error && (
          <>
            <LoaderCircle className="payment-spinner payment-result__icon" aria-hidden="true" />
            <h1>{installment ? "Проверяем заявку" : "Проверяем платёж"}</h1>
            <p>
              {installment
                ? "Получаем актуальный статус заявки у Т‑Банка."
                : "Ожидаем подтверждение от банка. Обычно это занимает несколько секунд."}
            </p>
          </>
        )}

        {isConfirmed && (
          <>
            <CheckCircle2 className="payment-result__icon" aria-hidden="true" />
            <h1>{installment ? "Рассрочка оформлена" : "Оплата подтверждена"}</h1>
            <p>
              {installment
                ? `Банк подтвердил рассрочку на программу «${payment.programTitle}». Электронный чек поставлен в очередь АТОЛ.`
                : `Заказ на программу «${payment.programTitle}» оплачен. Мы свяжемся с вами по указанным при оформлении контактам.`}
            </p>
          </>
        )}

        {payment && !isConfirmed && !isFailed && (
          <>
            <LoaderCircle className="payment-spinner payment-result__icon" aria-hidden="true" />
            <h1>
              {installment ? "Ждём оформления рассрочки" : "Ждём подтверждение"}
            </h1>
            <p>
              {installment
                ? "Заявка ещё не подписана или ожидает подтверждения выдачи. Статус обновится автоматически."
                : "Банк ещё обрабатывает платёж. Не закрывайте страницу — статус обновится автоматически."}
            </p>
          </>
        )}

        {(isFailed || error) && (
          <>
            <XCircle className="payment-result__icon" aria-hidden="true" />
            <h1>
              {installment ? "Рассрочка не оформлена" : "Оплата не подтверждена"}
            </h1>
            <p>
              {error ||
                (installment
                  ? "Банк не подтвердил выдачу рассрочки. Чек по этой заявке не формируется."
                  : "Банк не подтвердил операцию. Деньги за этот заказ не считаются полученными.")}
            </p>
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

export function PaymentResultPage() {
  return <PaymentStatusResult />;
}

export function InstallmentResultPage() {
  return <PaymentStatusResult installment />;
}
