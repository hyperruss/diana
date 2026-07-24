export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__top">
        <a className="logo logo--footer" href="#top">
          <span className="logo__mark">С</span>
          <span>
            <strong>СМЕНА</strong>
            <small>центр подготовки</small>
          </span>
        </a>
        <p>
          Практическая подготовка
          <br />
          специалистов ресторанной индустрии
        </p>
        <div className="footer__links">
          <a href="#programs">Направления</a>
          <a href="#process">Обучение</a>
          <a href="#faq">Вопросы и ответы</a>
          <a href="#request">Оставить заявку</a>
        </div>
      </div>
      <div className="container footer__bottom">
        <span>© 2026 СМЕНА</span>
        <span>Москва · адрес уточняется</span>
        <a href="#privacy">Политика конфиденциальности</a>
      </div>
    </footer>
  );
}
