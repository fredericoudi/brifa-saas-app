/* global jQuery */
/* global document */

jQuery(function ($) {
  'use strict';

  document.addEventListener("touchstart", function () {}, false);


    $('body').wrapInner('<div class="wsmenucontainer" />');
    $('<div class="overlapblackbg"></div>').prependTo('.wsmenu');

    $('#wsnavtoggle').click(function () {
      jQuery('body').toggleClass('wsactive');
    });

    $('.overlapblackbg').click(function () {
      $("body").removeClass('wsactive');
    });

    $('.wsmenu > .wsmenu-list > li').has('.sub-menu').prepend('<span class="wsmenu-click"><i class="wsmenu-arrow"></i></span>');
    $('.wsmenu > .wsmenu-list > li').has('.wsmegamenu').prepend('<span class="wsmenu-click"><i class="wsmenu-arrow"></i></span>');

    $('.wsmenu-click').click(function () {
      $(this).toggleClass('ws-activearrow')
        .parent().siblings().children().removeClass('ws-activearrow');
      $(".wsmenu > .wsmenu-list > li > .sub-menu, .wsmegamenu").not(jQuery(this).siblings('.wsmenu > .wsmenu-list > li > .sub-menu, .wsmegamenu')).slideUp('slow');
      $(this).siblings('.sub-menu').slideToggle('slow');
      $(this).siblings('.wsmegamenu').slideToggle('slow');
    });

    $('.wsmenu > .wsmenu-list > li > ul > li').has('.sub-menu').prepend('<span class="wsmenu-click02"><i class="wsmenu-arrow"></i></span>');
    $('.wsmenu > .wsmenu-list > li > ul > li > ul > li').has('.sub-menu').prepend('<span class="wsmenu-click02"><i class="wsmenu-arrow"></i></span>');

    $('.wsmenu-click02').click(function () {
      $(this).children('.wsmenu-arrow').toggleClass('wsmenu-rotate');
      $(this).siblings('li > .sub-menu').slideToggle('slow');
    });

    $(window).on('resize', function () {

      if ($(window).outerWidth() < 992) {
        $('.wsmenu').css('height', jQuery(this).height() + "px");
        $('.wsmenucontainer').css('min-width', jQuery(this).width() + "px");
      } else {
        $('.wsmenu').removeAttr("style");
        $('.wsmenucontainer').removeAttr("style");
        $('body').removeClass("wsactive");
        $('.wsmenu > .wsmenu-list > li > .wsmegamenu, .wsmenu > .wsmenu-list > li > ul.sub-menu, .wsmenu > .wsmenu-list > li > ul.sub-menu > li > ul.sub-menu, .wsmenu > .wsmenu-list > li > ul.sub-menu > li > ul.sub-menu > li > ul.sub-menu').removeAttr("style");
        $('.wsmenu-click').removeClass("ws-activearrow");
        $('.wsmenu-click02 > i').removeClass("wsmenu-rotate");
      }

    });

    $(window).trigger('resize');

  
	}( jQuery ) );