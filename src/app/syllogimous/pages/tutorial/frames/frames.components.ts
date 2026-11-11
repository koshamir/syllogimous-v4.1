import { Component } from '@angular/core';

// Lessons for «Три группы», «Условия», «Иерархия», «Точка зрения».

@Component({
    selector: 'app-tutorial-groups3',
    template: `
<h2>Три группы</h2>
<p>Групп три, каждый ровно в одной.</p>
<ul>
    <li><span class="subject">WCA</span> и <span class="subject">BWA</span> в разных группах</li>
    <li><span class="subject">BWA</span> и <span class="subject">KLO</span> в разных группах</li>
</ul>
<p><span class="subject">WCA</span> и <span class="subject">KLO</span> в одной группе — <strong>Неизвестно</strong>: KLO может быть и с WCA, и в третьей группе.</p>
<p>«В одной» переносится по цепочке, «в разных» — нет. Но если трое попарно в разных группах, все три группы заняты: четвёртый, кто не с двумя из них, — с третьим.</p>
<p class="small text-muted mb-0">Красное слово читай наоборот: в <span class="is-negated">разных группах</span> = в одной группе.</p>`,
})
export class TutorialGroups3Component { }

@Component({
    selector: 'app-tutorial-conditional',
    template: `
<h2>Условия</h2>
<p>Лампы горят или не горят.</p>
<ul>
    <li>Если <span class="subject">WCA</span> горит, то <span class="subject">BWA</span> не горит</li>
    <li><span class="subject">KLO</span> горит, только если <span class="subject">BWA</span> горит</li>
    <li><span class="subject">WCA</span> горит</li>
</ul>
<p><span class="subject">KLO</span> не горит — <strong>Следует</strong>: WCA горит ⇒ BWA не горит ⇒ KLO гореть не может.</p>
<p>Ловушки: из «если А, то Б» и «Б» не следует «А»; из «если А, то Б» и «не А» не следует «не Б» — это <strong>Неизвестно</strong>.</p>
<ul class="small mb-0">
    <li>«А, только если Б» — то же, что «если А, то Б».</li>
    <li>«А или Б горит» — хотя бы одна, возможно обе.</li>
    <li>«А и Б не горят вместе» — хотя бы одна не горит.</li>
</ul>`,
})
export class TutorialConditionalComponent { }

@Component({
    selector: 'app-tutorial-hierarchy',
    template: `
<h2>Иерархия</h2>
<p>Части и целые. «Часть» — на любой глубине: часть части — тоже часть. «Прямая часть» — без промежуточных; прямое целое у каждого одно.</p>
<ul>
    <li><span class="subject">WCA</span> — часть <span class="subject">BWA</span></li>
    <li><span class="subject">BWA</span> — часть <span class="subject">KLO</span></li>
</ul>
<p><span class="subject">WCA</span> — часть <span class="subject">KLO</span> — <strong>Следует</strong>.</p>
<p>А из «<span class="subject">WCA</span> — часть <span class="subject">BWA</span>» и «<span class="subject">WCA</span> — часть <span class="subject">KLO</span>» про <span class="subject">BWA</span> и <span class="subject">KLO</span> — <strong>Неизвестно</strong>: одно вложено в другое, но какое в какое — не сказано. Если же <span class="subject">WCA</span> — <em>прямая</em> часть <span class="subject">BWA</span>, то <span class="subject">BWA</span> — часть <span class="subject">KLO</span>.</p>
<p class="small text-muted mb-0">Красное слово читай наоборот: <span class="is-negated">часть</span> = не часть.</p>`,
})
export class TutorialHierarchyComponent { }

@Component({
    selector: 'app-tutorial-perspective',
    template: `
<h2>Точка зрения</h2>
<p>Все стоят в ряд перед тобой, лицом или спиной.</p>
<ul>
    <li><span class="subject">WCA</span> лицом к тебе</li>
    <li>У <span class="subject">WCA</span> справа <span class="subject">BWA</span></li>
</ul>
<p>WCA смотрит на тебя, его право — твоё лево.</p>
<p>Для тебя <span class="subject">BWA</span> левее <span class="subject">WCA</span> — <strong>Следует</strong>.</p>
<p>У стоящего спиной право совпадает с твоим. Пока не знаешь, куда человек смотрит, его «справа» ничего не даёт. «Справа» — не обязательно рядом.</p>
<p class="small text-muted mb-0">Красное слово читай наоборот: <span class="is-negated">справа</span> = слева.</p>`,
})
export class TutorialPerspectiveComponent { }
