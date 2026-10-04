// Guide page: Sankey demo and section scroll-spy. External file so the CSP needs no 'unsafe-inline'.
google.charts.load('current', {'packages':['sankey']});
google.charts.setOnLoadCallback(drawSankeyMock);

function drawSankeyMock() {
    const container = document.getElementById('sankey_mock');
    if (!container) return;

    const data = new google.visualization.DataTable();
    data.addColumn('string', 'Звідки');
    data.addColumn('string', 'Куди');
    data.addColumn('number', 'Сума (₴)');

    data.addRows([
        ['ФОП Коваленко', 'Ваш Бюджет', 850000],
        ['ТОВ "Омега"', 'Ваш Бюджет', 450000],
        ['Еквайринг', 'Ваш Бюджет', 850000],
        ['Ваш Бюджет', 'Закупівлі', 750000],
        ['Ваш Бюджет', 'Погашення боргів', 65000],
        ['Ваш Бюджет', 'Маркетинг та реклама', 150000],
        ['Ваш Бюджет', 'Оренда та комуналка', 205000],
        ['Ваш Бюджет', 'Вільний залишок', 980000]
    ]);

    const colors = ['#0a84ff', '#32d74b', '#ff9f0a', '#ff453a', '#5e5ce6', '#66d4cf', '#bf5af2'];
    const options = {
        backgroundColor: 'transparent',
        sankey: {
            node: { colors: colors, label: { color: '#ffffff', fontSize: 13, bold: true, fontName: '-apple-system' }, nodePadding: 20 },
            link: { colorMode: 'gradient', colors: colors }
        }
    };
    const chart = new google.visualization.Sankey(container);
    chart.draw(data, options);
}

document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('.section-anchor');
    const navLinks = document.querySelectorAll('.nav-link');
    let isScrolling = false; 

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            isScrolling = true;
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');

            setTimeout(() => { isScrolling = false; }, 800); 
        });
    });

    const observerOptions = {
        root: null,
        rootMargin: '-10% 0px -80% 0px',
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        if (isScrolling) return; 

        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const currentId = entry.target.getAttribute('id');
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${currentId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }, observerOptions);

    sections.forEach(section => observer.observe(section));
});
