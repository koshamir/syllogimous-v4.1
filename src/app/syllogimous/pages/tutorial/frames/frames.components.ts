import { Component } from '@angular/core';

// Lessons for the phase 5 frames (spec §9): «Три группы», «Условия», «Иерархия», «Точка зрения».

@Component({
    selector: 'app-tutorial-groups3',
    template: `
<h2>Три группы</h2>
<p>Есть три группы, каждый участник ровно в одной из них.</p>
<ul>
    <li><span class="subject">ВОЛ</span> и <span class="subject">ДЕК</span> в разных группах</li>
    <li><span class="subject">ДЕК</span> и <span class="subject">ЗУМ</span> в разных группах</li>
</ul>
<p><strong>Вывод:</strong> <span class="subject">ВОЛ</span> и <span class="subject">ЗУМ</span> в одной группе — <strong>Неизвестно</strong>: групп три, ЗУМ может быть и в группе ВОЛ, и в третьей.</p>
<p>«В одной группе» переносится по цепочке, «в разных» — нет.</p>
<h3>Инверсия</h3>
<p>Красное слово означает противоположное: в <span class="is-negated">разных группах</span> читается как «в одной группе».</p>`,
})
export class TutorialGroups3Component { }

@Component({
    selector: 'app-tutorial-conditional',
    template: `
<h2>Условия</h2>
<p>Каждая лампа либо горит, либо не горит.</p>
<ul>
    <li>Если горит <span class="subject">ВОЛ</span>, то не горит <span class="subject">ДЕК</span></li>
    <li><span class="subject">ЗУМ</span> горит, только если горит <span class="subject">ДЕК</span></li>
    <li>Лампа <span class="subject">ВОЛ</span> горит</li>
</ul>
<p><strong>Вывод:</strong> лампа <span class="subject">ЗУМ</span> не горит — <strong>Следует</strong>: ВОЛ горит ⇒ ДЕК не горит ⇒ ЗУМ не может гореть.</p>
<p>Ловушки: из «если А, то Б» и «Б» не следует «А»; из «если А, то Б» и «не А» не следует «не Б».</p>
<ul>
    <li>«А, только если Б» — то же, что «если А, то Б».</li>
    <li>«Горит А или Б» — горит хотя бы одна, возможно обе.</li>
    <li>«А и Б не горят одновременно» — хотя бы одна не горит.</li>
    <li>«Горит ровно одна из А и Б».</li>
</ul>`,
})
export class TutorialConditionalComponent { }

@Component({
    selector: 'app-tutorial-hierarchy',
    template: `
<h2>Иерархия</h2>
<p>Части и целые: каждая часть непосредственно входит не больше чем в одно целое. «Часть» — на любой глубине.</p>
<ul>
    <li><span class="subject">ВОЛ</span> — часть <span class="subject">ДЕК</span></li>
    <li><span class="subject">ДЕК</span> — часть <span class="subject">ЗУМ</span></li>
    <li><span class="subject">ПАЙ</span> — часть <span class="subject">ЗУМ</span></li>
</ul>
<p><strong>Вывод:</strong> <span class="subject">ВОЛ</span> — часть <span class="subject">ЗУМ</span> — <strong>Следует</strong>.</p>
<p><strong>Вывод:</strong> <span class="subject">ВОЛ</span> — часть <span class="subject">ПАЙ</span> — <strong>Неизвестно</strong>: ПАЙ может лежать между ВОЛ и ЗУМ, а может и в стороне.</p>
<p>Важное свойство: если А — часть Б и А — часть В, то Б и В вложены друг в друга (одно — часть другого).</p>`,
})
export class TutorialHierarchyComponent { }

@Component({
    selector: 'app-tutorial-perspective',
    template: `
<h2>Точка зрения</h2>
<p>Все стоят в ряд перед тобой, каждый — лицом к тебе или спиной.</p>
<ul>
    <li><span class="subject">ВОЛ</span> стоит лицом к тебе</li>
    <li>Для <span class="subject">ВОЛ</span> справа стоит <span class="subject">ДЕК</span></li>
</ul>
<p>ВОЛ смотрит на тебя, поэтому его право — это твоё лево: для тебя ДЕК левее, чем ВОЛ.</p>
<p><strong>Вывод:</strong> Для тебя <span class="subject">ДЕК</span> левее, чем <span class="subject">ВОЛ</span> — <strong>Следует</strong>.</p>
<p>Если человек стоит спиной к тебе, его право совпадает с твоим. «Справа» — не обязательно рядом.</p>`,
})
export class TutorialPerspectiveComponent { }
