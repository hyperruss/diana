import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

const programOptions = [
  "Бармен",
  "Бариста",
  "Официант",
  "Хостес",
  "Администратор",
  "Менеджер смены",
  "Пока не определился",
];

export default function RequestForm() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <form className="request-form reveal reveal--delay" onSubmit={handleSubmit}>
      <label>
        <span>Как вас зовут?</span>
        <input name="name" type="text" placeholder="Имя" required />
      </label>
      <label>
        <span>Ваш телефон</span>
        <input
          name="phone"
          type="tel"
          placeholder="+7 (___) ___-__-__"
          autoComplete="tel"
          required
        />
      </label>
      <label>
        <span>Какое направление интересно?</span>
        <select name="program" defaultValue="" required>
          <option value="" disabled>
            Выберите направление
          </option>
          {programOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      <button
        className="button button--accent button--full"
        type="submit"
        disabled={submitted}
      >
        {submitted ? "Заявка отправлена" : "Отправить заявку"}
        {!submitted && <ArrowUpRight size={17} aria-hidden="true" />}
      </button>
      <p className="request-form__legal">
        Нажимая кнопку, вы соглашаетесь с обработкой персональных данных.
      </p>
      {submitted && (
        <p className="request-form__success request-form__success--visible" role="status">
          Спасибо! Заявка принята — координатор свяжется с вами.
        </p>
      )}
    </form>
  );
}
