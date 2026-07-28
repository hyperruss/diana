import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  ShieldCheck,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
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
  privacyAccepted: false,
  personalDataAccepted: false,
};

export default function PaymentPage() {
  const { programId } = useParams();
  const program = programs.find((item) => item.id === programId);
  const [form, setForm] = useState(initialForm);
  const [statusVisible, setStatusVisible] = useState(false);

  if (!program) {
    return <NotFoundPage />;
  }

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
          <Link
            className="button button--dark"
            to={`/#program-${program.id}`}
          >
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
    setStatusVisible(false);
  };

  const submitPayment = (event) => {
    event.preventDefault();
    setStatusVisible(true);
  };

  return (
    <section className="payment-page">
      <div className="container">
        <Link
          className="payment-back"
          to={`/#program-${program.id}`}
        >
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
            После подключения эквайринга здесь будет открываться защищённая
            платёжная страница банка.
          </p>
        </header>

        <div className="payment-layout">
          <form className="payment-form" onSubmit={submitPayment}>
            <div className="payment-form__heading">
              <span>01 / Данные плательщика</span>
              <h2>Кому отправить чек</h2>
              <p>
                Контакты понадобятся для оформления оплаты и связи по выбранной
                программе.
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
                  required
                />
              </label>
            </div>

            <label className="payment-field">
              <span>Электронная почта для чека</span>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={updateForm}
                placeholder="name@example.ru"
                autoComplete="email"
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
                  <Link
                    to="/documents/offer"
                    target="_blank"
                    rel="noreferrer"
                  >
                    публичной оферты
                  </Link>
                  .
                </span>
              </label>

              <label className="payment-consent">
                <input
                  name="privacyAccepted"
                  type="checkbox"
                  checked={form.privacyAccepted}
                  onChange={updateForm}
                  required
                />
                <span>
                  Я ознакомлен с{" "}
                  <Link
                    to="/documents/privacy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    политикой конфиденциальности
                  </Link>{" "}
                  и{" "}
                  <Link
                    to="/documents/site-rules"
                    target="_blank"
                    rel="noreferrer"
                  >
                    правилами использования сайта
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
                  </Link>
                  .
                </span>
              </label>
            </fieldset>

            <button
              className="button button--accent button--full payment-form__submit"
              type="submit"
            >
              Оплатить {formatPrice(program.price)}
              <ArrowRight size={18} aria-hidden="true" />
            </button>

            <div
              className={`payment-form__status${
                statusVisible ? " payment-form__status--visible" : ""
              }`}
              role="status"
            >
              <Check size={18} aria-hidden="true" />
              <span>
                Данные проверены. Переход в эквайринг будет подключён на
                следующем этапе.
              </span>
            </div>
          </form>

          <aside className="payment-summary">
            <div>
              <span className="section-index section-index--light">
                Ваш заказ
              </span>
              <span className="payment-summary__number">{program.number}</span>
            </div>
            <p className="payment-summary__label">{program.label}</p>
            <h2>{program.title}</h2>
            <p className="payment-summary__description">
              {program.description}
            </p>
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
                Реквизиты банковской карты будут вводиться только на стороне
                платёжного провайдера.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
