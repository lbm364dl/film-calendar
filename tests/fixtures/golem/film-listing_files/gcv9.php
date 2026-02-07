@charset "utf-8";
/* CSS Document */

@font-face
{
font-family: FuenteGolemCines;
	src: url('/fuentes/Helvtc.eot#') format('eot'),
	     url('/fuentes/Helvtc.ttf')  format('truetype');
}         
       
@font-face
{
font-family: FuenteGolemCinesNeg;
	src: url('/fuentes/hnb1.eot#') format('eot'),
	     url('/fuentes/4857.ttf')  format('truetype');         
} 

body {
	margin-left: 0px;
	margin-top: 0px;
	margin-right: 0px;
	margin-bottom: 0px;
	margin: 0 auto;
   	background-image: url(../../golem/banner/1770114500-TRES-ADIOSES.jpg);
	background-repeat: no-repeat;
    background-attachment: fixed;
    background-position:top; 
    
	scrollbar-face-color: #333333;
	scrollbar-highlight-color: #FFFFFF;
	scrollbar-3dlight-color: #333333;
	scrollbar-darkshadow-color: #333333;
	scrollbar-shadow-color: #333333;
	scrollbar-arrow-color: #FFFFFF;
	scrollbar-track-color: #b8b8b8;
   
}

#cajaHomeOpinaTu {width: 675px;
	border-left: 1px;
	border-top: 1px;
	border-right: 1px;
	border-bottom: 1px;
    border-color: #AEAEAE;
    border-style: solid;
    background-color: #E5E5E5;
    height: 210px;
    

}

#tituloCajaHomeOpinaTu {
	font-family: FuenteGolemCines,  Helvetica-Narrow, sans-serif;
	font-size: 17px;
	font-style: normal;
	font-weight: normal;
	color: #000000;
    background-color: #E0E0E0;
    padding: 4px;

}

#imagenCajaHomeOpinaTu {
    float: left;
    padding: 4px;
    width: 125px;

}

#contenidoCajaHomeOpinaTu {
	padding: 4px;
	width: 530px;
	float: left;
}

#contenidoCajaHomeOpinaTu-Loop {
	border-left: 1px;
	border-top: 1px;
	border-right: 1px;
	border-bottom: 1px;
    border-color: #AEAEAE;
    border-style: solid;
    background-color :#EEEEEE;

}

#contenidoCajaHomeOpinaTu-pie {
	font-family: FuenteGolemCines,  Helvetica-Narrow, sans-serif;
	font-size: 17px;
	font-style: normal;
	font-weight: normal;
	color: #000000;
    overflow: hidden;
 	height:   1%;
    width: 100%;

}

#textoOpinion{
	font-family: FuenteGolemCines,  Helvetica-Narrow, sans-serif;
	font-size: 17px;
	font-style: normal;
	font-weight: normal;
	color: #000000;
    padding-left: 2px;
    padding-top: 2px;

}

#opinion{
	height: 55px;
    margin-left: 5px;
}

#valorOpinion {
	width: 205px;
	float: right;
	height: 25px;
	margin-top: 5px;
	margin-bottom: 5px;
	text-align: center;
}

#izquierdas {
	width: 125px;
    float: left;
    margin-top: 5px;

}

#derechas {
width: 135px;
float: right;
height: 23px;
text-align: right;
padding-top: 10px;
padding-right: 2px;
}

hr {
border: 0; 
border-top: 1px solid #AEAEAE;  
height:0;
margin: 1;
}

.PieCajaCines {
  display: block;
  padding: .2em 0 .2em .5em;
  text-decoration: none;
  list-style: none;
}

.PieCajaCines ul {
    list-style-type: none;
    margin: 0;
    padding: 0;
    width: 250px;
}

.PieCajaCines li a {
    display: block;
    color: #fff;
    text-decoration: none;
    padding: 8px 0 2px 0;
	list-style: none;
}

.PieCajaCines li a:hover {
    text-decoration: underline;

}

#marker {
	background: yellow;
}

.marker {
	background: yellow;
}