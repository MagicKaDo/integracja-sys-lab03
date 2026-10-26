// Paste your OpenWeatherMap API key here.
const API_KEY = '2693ded04bcfca5c41b9bc651c1514e0';

class WeatherView {
  constructor() {
    this.current = document.querySelector('#current-weather');
    this.forecast = document.querySelector('#forecast');
    this.status = document.querySelector('#status');
    this.button = document.querySelector('#search-button');
  }

  // Use textContent so API data cannot be interpreted as HTML.
  element(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  setStatus(message, isError = false) {
    this.status.textContent = message;
    this.status.classList.toggle('error', isError);
  }

  setLoading(loading) {
    this.button.disabled = loading;
    this.button.textContent = loading ? 'Pobieranie…' : 'Pogoda';
    document.querySelector('main').setAttribute('aria-busy', String(loading));
  }

  clear() {
    this.current.replaceChildren(this.element('p', 'placeholder', 'Pobieranie bieżącej pogody…'));
    this.forecast.replaceChildren(this.element('p', 'placeholder', 'Pobieranie prognozy…'));
  }

  formatNumber(value, unit) {
    return Number.isFinite(value) ? `${value.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}${unit}` : 'Brak danych';
  }

  // The API offset refers to the city's time zone, not the browser's time zone.
  localDate(timestamp, offset) {
    return new Date((timestamp + offset) * 1000);
  }

  formatTime(date) {
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  }

  weatherIcon(weather) {
    const image = this.element('img', 'weather-icon');
    if (/^\d{2}[dn]$/.test(weather.icon)) {
      image.src = `https://openweathermap.org/img/wn/${weather.icon}@2x.png`;
    }
    image.alt = weather.description;
    image.width = 72;
    image.height = 72;
    return image;
  }

  renderCurrent(data) {
    const summary = this.element('div', 'current-summary');
    const details = this.element('div', 'current-details');
    const weather = data.weather[0];
    details.append(
      this.element('h3', 'city-name', `${data.name}, ${data.sys.country}`),
      this.element('p', 'temperature', this.formatNumber(data.main.temp, ' °C')),
      this.element('p', 'description', weather.description),
      this.element('p', 'section-note', `Pomiar o ${this.formatTime(this.localDate(data.dt, data.timezone))} czasu miejscowego`)
    );
    summary.append(details, this.weatherIcon(weather));

    const metrics = this.element('dl', 'metrics');
    const values = [
      ['Odczuwalna', this.formatNumber(data.main.feels_like, ' °C')],
      ['Wilgotność', this.formatNumber(data.main.humidity, '%')],
      ['Wiatr', this.formatNumber(data.wind?.speed, ' m/s')],
      ['Ciśnienie', this.formatNumber(data.main.pressure, ' hPa')]
    ];
    for (const [label, value] of values) {
      const metric = this.element('div', 'metric');
      metric.append(this.element('dt', '', label), this.element('dd', '', value));
      metrics.append(metric);
    }
    this.current.replaceChildren(summary, metrics);
  }

  renderForecast(data) {
    const content = document.createDocumentFragment();
    content.append(this.element('p', 'forecast-location', `${data.city.name}, ${data.city.country}`));
    let previousDay = '';
    let grid;

    // The API returns forecasts in chronological order. Each new date starts a new section.
    for (const item of data.list) {
      const date = this.localDate(item.dt, data.city.timezone);
      const dayKey = date.toISOString().slice(0, 10);
      if (dayKey !== previousDay) {
        const section = this.element('section', 'forecast-day');
        section.append(this.element('h3', '', date.toLocaleDateString('pl-PL', {
          weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
        })));
        grid = this.element('div', 'forecast-grid');
        section.append(grid);
        content.append(section);
        previousDay = dayKey;
      }

      const card = this.element('article', 'forecast-card');
      card.append(
        this.element('h4', '', this.formatTime(date)),
        this.weatherIcon(item.weather[0]),
        this.element('p', 'forecast-temperature', this.formatNumber(item.main.temp, ' °C')),
        this.element('p', 'description', item.weather[0].description),
        this.element('p', 'forecast-detail', `Opady: ${this.formatNumber(item.pop * 100, '%')}`),
        this.element('p', 'forecast-detail', `Wiatr: ${this.formatNumber(item.wind?.speed, ' m/s')}`)
      );
      grid.append(card);
    }
    this.forecast.replaceChildren(content);
  }
}

class WeatherApp {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.view = new WeatherView();
    this.form = document.querySelector('#weather-form');
    this.cityInput = document.querySelector('#city');
    this.pendingRequests = 0;
    this.hasError = false;
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.search();
    });
  }

  search() {
    if (this.pendingRequests > 0) return;
    const city = this.cityInput.value.trim();
    if (!city) {
      this.view.setStatus('Podaj miejscowość.', true);
      this.cityInput.focus();
      return;
    }
    if (!this.apiKey.trim()) {
      this.view.setStatus('Uzupełnij stałą API_KEY w pliku scripts.js.', true);
      return;
    }

    this.pendingRequests = 2;
    this.hasError = false;
    this.view.setLoading(true);
    this.view.clear();
    this.view.setStatus(`Pobieranie pogody dla: ${city}…`);
    this.getCurrentWeather(city);
    this.getForecast(city);
  }

  createUrl(endpoint, city) {
    const params = new URLSearchParams({
      q: city, appid: this.apiKey, units: 'metric', lang: 'pl'
    });
    return `https://api.openweathermap.org/data/2.5/${endpoint}?${params}`;
  }

  getErrorMessage(status) {
    switch (status) {
      case 401: return 'Klucz API jest nieprawidłowy lub jeszcze nieaktywny.';
      case 404: return 'Nie znaleziono miejscowości. Sprawdź nazwę i kod kraju.';
      case 429: return 'Przekroczono limit zapytań. Spróbuj ponownie później.';
      default: return 'Nie udało się pobrać danych pogodowych. Spróbuj ponownie.';
    }
  }

  // XHR: receive the response in the onload event handler.
  getCurrentWeather(city) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', this.createUrl('weather', city), true);
    xhr.responseType = 'json';
    xhr.timeout = 15000;

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log('Bieżąca pogoda (XMLHttpRequest):', xhr.response);
        this.view.renderCurrent(xhr.response);
      } else {
        this.showError(this.view.current, this.getErrorMessage(xhr.status));
      }
    };
    xhr.onerror = () => this.showError(this.view.current, 'Błąd połączenia. Sprawdź dostęp do internetu.');
    xhr.ontimeout = () => this.showError(this.view.current, 'Przekroczono czas oczekiwania na pogodę.');
    xhr.onloadend = () => this.finishRequest();
    xhr.send();
  }

  // Fetch returns a Promise: handle the response in then and errors in catch.
  getForecast(city) {
    fetch(this.createUrl('forecast', city))
      .then((response) => {
        // HTTP 404/401 does not trigger catch automatically, so check the status.
        if (!response.ok) {
          throw new Error(this.getErrorMessage(response.status));
        }
        return response.json();
      })
      .then((data) => {
        console.log('Prognoza na 5 dni (fetch):', data);
        this.view.renderForecast(data);
      })
      .catch((error) => {
        const message = error instanceof TypeError
          ? 'Błąd połączenia lub nieprawidłowe dane prognozy.'
          : error.message;
        this.showError(this.view.forecast, message);
      })
      .finally(() => this.finishRequest());
  }

  showError(panel, message) {
    this.hasError = true;
    panel.replaceChildren(this.view.element('p', 'error', message));
    this.view.setStatus(message, true);
  }

  // Enable the form once both independent requests have finished.
  finishRequest() {
    this.pendingRequests--;
    if (this.pendingRequests === 0) {
      this.view.setLoading(false);
      if (!this.hasError) this.view.setStatus('Dane pogodowe zostały zaktualizowane.');
    }
  }
}

new WeatherApp(API_KEY);
